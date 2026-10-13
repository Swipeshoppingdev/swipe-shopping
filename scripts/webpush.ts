// Notifiche dal sito (Web Push): iPhone con il sito aggiunto alla schermata Home (iOS 16.4+),
// Chrome/Edge/Firefox su computer e Android. Niente Firebase: il browser dà un "abbonamento"
// ({endpoint, keys}) salvato in push_tokens con platform 'web', e qui lo si usa direttamente.
// - Le chiavi VAPID (P-256) si ricavano dal secret SUPABASE_SERVICE_ROLE_KEY, così non serve un secret
//   nuovo. Se quel secret cambia, gli abbonamenti vecchi smettono di funzionare e vengono tolti da soli.
// - Il contenuto è cifrato come vuole lo standard (RFC 8291, aes128gcm) e firmato (RFC 8292, VAPID).
// `node scripts/webpush.ts` stampa la chiave pubblica da mettere in src/config/app.ts (WEB_PUSH_KEY).
import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign } from 'node:crypto'
import { FCM_SCOPE, accessToken, fcmSender, type PushMessage, type ServiceAccount } from './google.ts'

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url')
const SUBJECT = 'mailto:noreply@swipeshopping.app'

export function vapidKeys(seed: string) {
  const d = Buffer.from(hkdfSync('sha256', seed, 'swipeshopping.app', 'web-push-vapid-p256', 32))
  const ecdh = createECDH('prime256v1')
  ecdh.setPrivateKey(d)
  const pub = ecdh.getPublicKey()
  const key = createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: b64url(d), x: b64url(pub.subarray(1, 33)), y: b64url(pub.subarray(33, 65)) },
    format: 'jwk',
  })
  return { publicKey: b64url(pub), privateKey: key }
}

/** Cifra il messaggio per un abbonamento (RFC 8291, un solo blocco). */
export function encrypt(payload: Buffer, p256dh: Buffer, auth: Buffer, salt = randomBytes(16)) {
  const local = createECDH('prime256v1')
  local.generateKeys()
  const asPublic = local.getPublicKey()
  const shared = local.computeSecret(p256dh)
  const ikm = Buffer.from(hkdfSync('sha256', shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), p256dh, asPublic]), 32))
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16))
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12))
  const cipher = createCipheriv('aes-128-gcm', cek, nonce)
  const body = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()])
  const rs = Buffer.alloc(4)
  rs.writeUInt32BE(4096)
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body])
}

function vapidHeader(endpoint: string, keys: ReturnType<typeof vapidKeys>) {
  const claims = { aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT }
  const unsigned = `${b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))}.${b64url(JSON.stringify(claims))}`
  const sig = sign('sha256', Buffer.from(unsigned), { key: keys.privateKey, dsaEncoding: 'ieee-p1363' })
  return `vapid t=${unsigned}.${b64url(sig)}, k=${keys.publicKey}`
}

export const isWebToken = (token: string) => token.startsWith('{')

/** Invia una notifica a un browser. 'gone' = abbonamento scaduto o non più valido (da togliere). */
export function webPushSender(seed: string, topic: 'amici' | 'offerte' | 'marche' = 'offerte') {
  const keys = vapidKeys(seed)
  return async (token: string, m: PushMessage): Promise<'ok' | 'gone' | 'error'> => {
    let sub: { endpoint: string; keys: { p256dh: string; auth: string } }
    try {
      sub = JSON.parse(token)
      if (!sub.endpoint.startsWith('https://')) return 'gone'
    } catch {
      return 'gone'
    }
    const body = encrypt(
      Buffer.from(JSON.stringify({ title: m.title, body: m.body, url: m.url, tag: topic })),
      Buffer.from(sub.keys.p256dh, 'base64url'),
      Buffer.from(sub.keys.auth, 'base64url'),
    )
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: vapidHeader(sub.endpoint, keys),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(topic === 'amici' ? 6 * 3600 : 24 * 3600),
        Urgency: topic === 'amici' ? 'high' : 'normal',
        // Lo stesso Topic sostituisce la notifica precedente non ancora consegnata.
        Topic: topic,
      },
      body,
    }).catch(() => null)
    if (!res) return 'error'
    if (res.ok) return 'ok'
    // 404/410: abbonamento finito. 403: chiave VAPID cambiata (abbonamento fatto con la chiave vecchia).
    if (res.status === 404 || res.status === 410 || res.status === 403) return 'gone'
    console.log(`::warning::Notifica web non inviata: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
    return 'error'
  }
}

/**
 * Un solo invio per telefoni (app Android, Firebase) e browser (Web Push): sceglie la strada dal token.
 * Senza FCM_SERVICE_ACCOUNT i token dell'app si saltano ('error'), quelli web partono lo stesso.
 */
export async function pushSender(channel: 'amici' | 'offerte' | 'marche', env: { fcm?: string; seed: string }) {
  let fcm: ReturnType<typeof fcmSender> | null = null
  if (env.fcm) {
    const sa = JSON.parse(env.fcm) as ServiceAccount
    fcm = fcmSender(sa, await accessToken(sa, FCM_SCOPE), channel === 'amici' ? 'amici' : 'offerte')
  }
  const web = webPushSender(env.seed, channel)
  return async (token: string, m: PushMessage) => (isWebToken(token) ? web(token, m) : fcm ? fcm(token, m) : ('error' as const))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seed = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!seed) console.log('Manca SUPABASE_SERVICE_ROLE_KEY.')
  else console.log(`Chiave pubblica Web Push (WEB_PUSH_KEY): ${vapidKeys(seed).publicKey}`)
}
