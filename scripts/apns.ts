// Notifiche push all'app iPhone direttamente con Apple (APNs, HTTP/2), senza Firebase.
// Serve una chiave "Apple Push Notifications service" di developer.apple.com nei secret APNS_KEY (testo del .p8),
// APNS_KEY_ID e APPLE_TEAM_ID. Senza, le notifiche iPhone non partono (le altre sì).
// Il token del telefono è salvato come "apns:<token>" (src/lib/push.ts).
import { sign } from 'node:crypto'
import { connect, type ClientHttp2Session } from 'node:http2'
import type { PushMessage } from './google.ts'

const TOPIC = 'app.swipeshopping'
export const isApnsToken = (token: string) => token.startsWith('apns:')

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url')

export function apnsSender(cfg: { key: string; keyId: string; teamId: string }, channel: string) {
  let jwt = ''
  let jwtAt = 0
  // Apple vuole lo stesso token di accesso per 20-60 minuti, non uno nuovo a ogni notifica.
  const bearer = () => {
    if (Date.now() - jwtAt > 40 * 60_000) {
      jwtAt = Date.now()
      const unsigned = `${b64url(JSON.stringify({ alg: 'ES256', kid: cfg.keyId }))}.${b64url(JSON.stringify({ iss: cfg.teamId, iat: Math.floor(jwtAt / 1000) }))}`
      jwt = `${unsigned}.${b64url(sign('sha256', Buffer.from(unsigned), { key: cfg.key, dsaEncoding: 'ieee-p1363' }))}`
    }
    return jwt
  }
  // Una connessione per tutto il giro, chiusa dopo qualche secondo senza invii (se no lo script non finirebbe).
  let session: ClientHttp2Session | null = null
  let idle: ReturnType<typeof setTimeout> | undefined
  const open = () => {
    clearTimeout(idle)
    if (!session || session.closed || session.destroyed) {
      session = connect('https://api.push.apple.com')
      session.on('error', () => (session = null))
    }
    return session
  }
  const release = () => {
    clearTimeout(idle)
    idle = setTimeout(() => session?.close(), 3000)
  }

  return (token: string, m: PushMessage) =>
    new Promise<'ok' | 'gone' | 'error'>((resolve) => {
      let req
      try {
        req = open().request({
          ':method': 'POST',
          ':path': `/3/device/${token.slice('apns:'.length)}`,
          authorization: `bearer ${bearer()}`,
          'apns-topic': TOPIC,
          'apns-push-type': 'alert',
          'apns-priority': '10',
          // Come il tag su Android: una notifica nuova dello stesso tipo sostituisce la precedente.
          'apns-collapse-id': channel,
        })
      } catch {
        resolve('error')
        return
      }
      let status = 0
      let body = ''
      req.setEncoding('utf8')
      req.on('response', (h) => (status = Number(h[':status'])))
      req.on('data', (c: string) => (body += c))
      req.on('end', () => {
        release()
        if (status === 200) resolve('ok')
        else if (status === 410 || (status === 400 && /BadDeviceToken|DeviceTokenNotForTopic/.test(body))) resolve('gone')
        else {
          console.warn(`APNs ${status}: ${body.slice(0, 200)}`)
          resolve('error')
        }
      })
      req.on('error', () => {
        release()
        resolve('error')
      })
      req.end(JSON.stringify({ aps: { alert: { title: m.title, body: m.body }, sound: 'default', 'thread-id': channel }, url: m.url }))
    })
}

/** Il mittente iPhone se ci sono i secret, altrimenti null. */
export function apnsFromEnv(channel: string) {
  const { APNS_KEY, APNS_KEY_ID, APPLE_TEAM_ID } = process.env
  if (!APNS_KEY || !APNS_KEY_ID || !APPLE_TEAM_ID) return null
  return apnsSender({ key: APNS_KEY.replace(/\r/g, ''), keyId: APNS_KEY_ID, teamId: APPLE_TEAM_ID }, channel)
}
