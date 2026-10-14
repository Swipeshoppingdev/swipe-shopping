// Firma dell'app iPhone tramite l'API di App Store Connect (chiave nei segreti APPSTORE_*), senza Mac né Xcode a mano.
// Usato da .github/workflows/ios.yml:
//   node scripts/appstore.ts cert <richiesta.csr> <uscita.cer>   crea il certificato di distribuzione (una volta sola)
//   node scripts/appstore.ts profile <id certificato> <uscita.mobileprovision>
//       prepara l'ID app (con "Accedi con Apple" e le notifiche) e crea un profilo App Store nuovo, così contiene sempre
//       le funzioni attive; stampa il nome del profilo.
//   node scripts/appstore.ts build-status <numero build>   aspetta (fino a 40 minuti) che Apple finisca di elaborare la build
// Variabili: APPSTORE_KEY_ID, APPSTORE_ISSUER_ID, APPSTORE_KEY_PATH (file .p8).
import { sign } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const BUNDLE_ID = 'app.swipeshopping'
const PROFILE_NAME = 'Swipe Shopping App Store'
/** Funzioni dell'app che il profilo deve includere (vedi ios/App/App/App.entitlements). */
const CAPABILITIES: Record<string, unknown[]> = {
  APPLE_ID_AUTH: [{ key: 'APPLE_ID_AUTH_APP_CONSENT', options: [{ key: 'PRIMARY_APP_CONSENT' }] }],
  PUSH_NOTIFICATIONS: [],
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url')

function token() {
  const now = Math.floor(Date.now() / 1000)
  const head = { alg: 'ES256', kid: process.env.APPSTORE_KEY_ID, typ: 'JWT' }
  const claims = { iss: process.env.APPSTORE_ISSUER_ID, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' }
  const unsigned = `${b64url(JSON.stringify(head))}.${b64url(JSON.stringify(claims))}`
  const key = readFileSync(process.env.APPSTORE_KEY_PATH!, 'utf8')
  return `${unsigned}.${b64url(sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }))}`
}

type Item = { id: string; attributes: Record<string, unknown> }

async function api(method: string, path: string, body?: unknown): Promise<{ data: Item | Item[] }> {
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`App Store Connect ${method} ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 500)}`)
  return res.status === 204 ? { data: [] } : ((await res.json()) as { data: Item | Item[] })
}
const list = async (path: string) => (await api('GET', path)).data as Item[]
const one = async (method: string, path: string, body: unknown) => (await api(method, path, body)).data as Item

async function createCertificate(csrPath: string, outPath: string) {
  const cert = await one('POST', 'certificates', {
    data: { type: 'certificates', attributes: { certificateType: 'DISTRIBUTION', csrContent: readFileSync(csrPath, 'utf8') } },
  })
  writeFileSync(outPath, Buffer.from(String(cert.attributes.certificateContent), 'base64'))
  console.log(cert.id)
}

async function bundleId() {
  const found = (await list(`bundleIds?filter[identifier]=${BUNDLE_ID}&limit=50`)).find(
    (b) => b.attributes.identifier === BUNDLE_ID,
  )
  if (found) return found.id
  const created = await one('POST', 'bundleIds', {
    data: { type: 'bundleIds', attributes: { name: 'Swipe Shopping', identifier: BUNDLE_ID, platform: 'IOS' } },
  })
  return created.id
}

async function createProfile(certId: string, outPath: string) {
  const id = await bundleId()
  const active = new Set((await list(`bundleIds/${id}/bundleIdCapabilities`)).map((c) => c.attributes.capabilityType))
  for (const [capabilityType, settings] of Object.entries(CAPABILITIES)) {
    if (active.has(capabilityType)) continue
    await one('POST', 'bundleIdCapabilities', {
      data: {
        type: 'bundleIdCapabilities',
        attributes: { capabilityType, settings },
        relationships: { bundleId: { data: { type: 'bundleIds', id } } },
      },
    })
    console.error(`Attivata la funzione ${capabilityType}`)
  }
  for (const old of await list(`profiles?filter[name]=${encodeURIComponent(PROFILE_NAME)}&limit=50`)) {
    await api('DELETE', `profiles/${old.id}`)
  }
  const profile = await one('POST', 'profiles', {
    data: {
      type: 'profiles',
      attributes: { name: PROFILE_NAME, profileType: 'IOS_APP_STORE' },
      relationships: {
        bundleId: { data: { type: 'bundleIds', id } },
        certificates: { data: [{ type: 'certificates', id: certId }] },
      },
    },
  })
  writeFileSync(outPath, Buffer.from(String(profile.attributes.profileContent), 'base64'))
  console.log(PROFILE_NAME)
}

async function buildStatus(number: string) {
  const app = (await list(`apps?filter[bundleId]=${BUNDLE_ID}&limit=1`))[0]
  if (!app) throw new Error(`App ${BUNDLE_ID} non trovata`)
  for (let i = 0; i < 80; i++) {
    const build = (await list(`builds?filter[app]=${app.id}&filter[version]=${number}&limit=1`))[0]
    const state = String(build?.attributes.processingState ?? 'NON ANCORA ARRIVATA')
    console.log(`${new Date().toISOString()} build ${number}: ${state}`)
    if (state === 'VALID') return
    if (state === 'FAILED' || state === 'INVALID') throw new Error(`Build ${number}: ${state}`)
    await new Promise((r) => setTimeout(r, 30_000))
  }
  throw new Error(`Build ${number} ancora in elaborazione dopo 40 minuti`)
}

const [cmd, a, b] = process.argv.slice(2)
if (cmd === 'cert') await createCertificate(a, b)
else if (cmd === 'profile') await createProfile(a, b)
else if (cmd === 'build-status') await buildStatus(a)
else throw new Error('Uso: appstore.ts cert <csr> <cer> | profile <certId> <mobileprovision> | build-status <numero>')
