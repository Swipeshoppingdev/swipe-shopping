// Accesso alle API Google con l'account di servizio (JSON nel secret FCM_SERVICE_ACCOUNT):
// token OAuth da un JWT firmato RS256, e invio di una notifica Firebase (API HTTP v1).
// Usato da push.ts (amici), price-alerts.ts (offerte sui preferiti) e play-upload.ts (Google Play).
import { createSign } from 'node:crypto'

export interface ServiceAccount {
  project_id: string
  client_email: string
  private_key: string
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url')

export async function accessToken(sa: ServiceAccount, scope: string) {
  const now = Math.floor(Date.now() / 1000)
  const claims = { iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}`
  const signature = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  })
  if (!res.ok) throw new Error(`Accesso a Google non riuscito: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
  return ((await res.json()) as { access_token: string }).access_token
}

export interface PushMessage {
  title: string
  body: string
  url: string
}

/** Invia una notifica a un telefono. 'gone' = telefono non più registrato (da togliere). */
export function fcmSender(sa: ServiceAccount, bearer: string, channel: 'amici' | 'offerte' = 'offerte') {
  return async (token: string, m: PushMessage): Promise<'ok' | 'gone' | 'error'> => {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: m.title, body: m.body },
          data: { url: m.url },
          // Lo stesso tag sostituisce la notifica precedente dello stesso tipo invece di accumularle.
          android: { priority: channel === 'amici' ? 'high' : 'normal', notification: { channel_id: channel, tag: channel } },
        },
      }),
    })
    if (res.ok) return 'ok'
    const text = await res.text()
    if (res.status === 404 || text.includes('UNREGISTERED')) return 'gone'
    console.log(`::warning::Notifica non inviata: HTTP ${res.status} ${text.slice(0, 200)}`)
    return 'error'
  }
}

export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
