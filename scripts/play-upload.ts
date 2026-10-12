// Carica l'app (file .aab) su Google Play, nel canale di test chiuso, con l'API Google Play Developer.
// Usa l'account di servizio nel secret PLAY_SERVICE_ACCOUNT (o, se manca, FCM_SERVICE_ACCOUNT): in Play Console
// deve essere invitato in "Utenti e autorizzazioni" con il permesso di rilasciare nei canali di test,
// e nel suo progetto Google Cloud deve essere abilitata la "Google Play Android Developer API".
// Uso (da android.yml): `node scripts/play-upload.ts out/swipe-shopping.aab`
// Variabili: PLAY_TRACK (di base "alpha" = test chiuso), PLAY_NOTES (note di rilascio, facoltative).
import { readFileSync } from 'node:fs'
import { accessToken, type ServiceAccount } from './google.ts'

const PACKAGE = 'app.swipeshopping'
const TRACK = process.env.PLAY_TRACK || 'alpha'
const NOTES = (process.env.PLAY_NOTES || 'Miglioramenti e novità.').slice(0, 500)
const SA_JSON = process.env.PLAY_SERVICE_ACCOUNT || process.env.FCM_SERVICE_ACCOUNT
const file = process.argv[2]

if (!SA_JSON) {
  console.log('::error::Manca il secret PLAY_SERVICE_ACCOUNT (o FCM_SERVICE_ACCOUNT).')
  process.exit(1)
}
if (!file) {
  console.log('::error::Manca il file .aab da caricare.')
  process.exit(1)
}

const sa = JSON.parse(SA_JSON) as ServiceAccount
const bearer = await accessToken(sa, 'https://www.googleapis.com/auth/androidpublisher')
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}`

async function call<T>(url: string, init: RequestInit & { body?: BodyInit } = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json', ...init.headers } })
  const text = await res.text()
  if (!res.ok) {
    const hint =
      res.status === 403
        ? " Controlla che l'account di servizio sia invitato in Play Console con il permesso di rilasciare nei test e che l'API Google Play Android Developer sia abilitata."
        : ''
    throw new Error(`Google Play: HTTP ${res.status} ${text.slice(0, 300)}${hint}`)
  }
  return (text ? JSON.parse(text) : null) as T
}

try {
  const edit = await call<{ id: string }>(`${API}/edits`, { method: 'POST', body: '{}' })
  console.log(`Carico ${file} su Google Play…`)
  const bundle = await call<{ versionCode: number }>(
    `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PACKAGE}/edits/${edit.id}/bundles?uploadType=media`,
    { method: 'POST', body: readFileSync(file), headers: { 'Content-Type': 'application/octet-stream' } },
  )
  await call(`${API}/edits/${edit.id}/tracks/${TRACK}`, {
    method: 'PUT',
    body: JSON.stringify({
      track: TRACK,
      releases: [{ versionCodes: [String(bundle.versionCode)], status: 'completed', releaseNotes: [{ language: 'it-IT', text: NOTES }] }],
    }),
  })
  await call(`${API}/edits/${edit.id}:commit`, { method: 'POST' })
  console.log(`::notice::Versione ${bundle.versionCode} caricata su Google Play (canale ${TRACK}). Google la controlla prima di mandarla ai tester.`)
} catch (e) {
  console.log(`::error::${e instanceof Error ? e.message : e}`)
  process.exit(1)
}
