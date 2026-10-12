// Notifiche push per l'app Android: quando un amico ti manda qualcosa in "Per te" (tabella inbox,
// vedi supabase/schema-5.sql e schema-6.sql). Gira su GitHub Actions ogni 5 minuti e usa Firebase
// Cloud Messaging (API HTTP v1) con l'account di servizio nel secret FCM_SERVICE_ACCOUNT.
// - I testi sono sempre fissi: nessun testo scritto dagli utenti finisce nelle notifiche.
// - Più novità per la stessa persona diventano una sola notifica ("Hai 3 novità dagli amici").
// - Le novità più vecchie di 2 ore non vengono mandate (solo segnate come fatte).
// - I telefoni che non esistono più vengono tolti.
// Uso: `node scripts/push.ts` (con `--dry` mostra cosa manderebbe, senza inviare).
import { FCM_SCOPE, accessToken, fcmSender, type PushMessage, type ServiceAccount } from './google.ts'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hlsqxxcztysnlijznjng.supabase.co'
const { SUPABASE_SERVICE_ROLE_KEY, FCM_SERVICE_ACCOUNT } = process.env
const DRY = process.argv.includes('--dry')

if (!SUPABASE_SERVICE_ROLE_KEY || (!FCM_SERVICE_ACCOUNT && !DRY)) {
  console.log('::notice::Notifiche push non attive: mancano i secrets SUPABASE_SERVICE_ROLE_KEY e/o FCM_SERVICE_ACCOUNT.')
  process.exit(0)
}

interface Item {
  id: number
  recipient: string
  sender: string
  kind: 'consiglio' | 'sondaggio' | 'lista' | 'swipe' | 'reazione' | 'segreto' | 'estrazione'
  ref_id: string | null
  emoji: string | null
  created_at: string
}

const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' }

async function rest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}${path}`, { ...init, headers: { ...headers, ...init?.headers } })
  if (!res.ok) throw new Error(`${path.split('?')[0]}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
  return (res.status === 204 || res.status === 201 ? null : await res.json()) as T
}
const inList = (values: (string | number)[]) => `in.(${values.map((v) => `"${v}"`).join(',')})`
const markPushed = async (ids: number[]) => {
  for (let i = 0; i < ids.length; i += 200)
    await rest(`/rest/v1/inbox?id=${inList(ids.slice(i, i + 200))}`, {
      method: 'PATCH',
      body: JSON.stringify({ pushed: true }),
      headers: { Prefer: 'return=minimal' },
    })
}

let items: Item[]
try {
  items = await rest<Item[]>('/rest/v1/inbox?pushed=eq.false&order=created_at.asc&limit=2000&select=id,recipient,sender,kind,ref_id,emoji,created_at')
} catch (e) {
  // Colonna o tabella assente: schema-6.sql non è ancora stato eseguito.
  console.log(`::notice::Notifiche push non disponibili: ${e instanceof Error ? e.message : e}`)
  process.exit(0)
}
if (items.length === 0) {
  console.log('Nessuna novità da avvisare.')
  process.exit(0)
}

const cutoff = Date.now() - 2 * 3600_000
const old = items.filter((i) => new Date(i.created_at).getTime() < cutoff)
const fresh = items.filter((i) => new Date(i.created_at).getTime() >= cutoff)
if (old.length && !DRY) await markPushed(old.map((i) => i.id))

const recipients = [...new Set(fresh.map((i) => i.recipient))]
const senders = [...new Set(fresh.map((i) => i.sender))]
const [tokens, profiles, blocks] = recipients.length
  ? await Promise.all([
      rest<{ token: string; user_id: string }[]>(`/rest/v1/push_tokens?user_id=${inList(recipients)}&select=token,user_id`),
      rest<{ user_id: string; handle: string; code: string }[]>(`/rest/v1/profiles?user_id=${inList(senders)}&select=user_id,handle,code`),
      rest<{ blocker: string; blocked: string }[]>(`/rest/v1/blocks?blocker=${inList(recipients)}&select=blocker,blocked`),
    ])
  : [[], [], []]
const handle = new Map(profiles.map((p) => [p.user_id, p.handle]))
const codeOf = new Map(profiles.map((p) => [p.user_id, p.code]))
const blocked = new Set(blocks.map((b) => `${b.blocker}:${b.blocked}`))

/** Testo fisso per ogni tipo di novità. */
function message(i: Item): { title: string; body: string; url: string } {
  const who = handle.get(i.sender) ?? 'Un amico'
  switch (i.kind) {
    case 'consiglio':
      return { title: `${who} ti ha mandato un prodotto`, body: 'Guardalo nella chat', url: codeOf.has(i.sender) ? `#/chat/${codeOf.get(i.sender)}` : '#/amici' }
    case 'sondaggio':
      return { title: `${who} ti chiede un parere`, body: 'Vota il sondaggio: sì o no?', url: `#/sondaggio/${i.ref_id}` }
    case 'lista':
      return { title: `${who} ti ha mandato una lista regalo`, body: 'Guarda cosa desidera', url: `#/regalo/${i.ref_id}` }
    case 'swipe':
      return { title: `${who} ti invita a Swipe insieme`, body: 'Scoprite cosa piace a entrambi', url: `#/insieme/${i.ref_id}` }
    case 'segreto':
      return { title: `${who} ti invita al Babbo Natale segreto`, body: 'Entra nel gruppo per partecipare all\'estrazione', url: `#/segreto/${i.ref_id}` }
    case 'estrazione':
      return { title: 'Estrazione fatta! 🎁', body: 'Scopri a chi fai il regalo nel Babbo Natale segreto', url: `#/segreto/${i.ref_id}` }
    case 'reazione':
      return { title: `${who} ha reagito ${i.emoji ?? ''}`.trim(), body: 'Guarda in Amici', url: '#/amici' }
  }
}

let send: (token: string, m: PushMessage) => Promise<'ok' | 'gone' | 'error'>
if (DRY) {
  send = async (token, m) => (console.log(`[prova] ${token.slice(0, 12)}… → ${m.title} (${m.url})`), 'ok')
} else {
  const sa = JSON.parse(FCM_SERVICE_ACCOUNT!) as ServiceAccount
  send = fcmSender(sa, await accessToken(sa, FCM_SCOPE), 'amici')
}

let sent = 0
const gone: string[] = []
for (const r of recipients) {
  const mine = fresh.filter((i) => i.recipient === r && !blocked.has(`${r}:${i.sender}`))
  const phones = tokens.filter((t) => t.user_id === r)
  if (mine.length === 0 || phones.length === 0) continue
  const m = mine.length === 1 ? message(mine[0]) : { title: `Hai ${mine.length} novità dagli amici`, body: 'Guarda in Amici → Per te', url: '#/amici' }
  for (const p of phones) {
    const result = await send(p.token, m)
    if (result === 'ok') sent++
    if (result === 'gone') gone.push(p.token)
  }
}
if (!DRY) {
  await markPushed(fresh.map((i) => i.id))
  for (const t of gone) await rest(`/rest/v1/push_tokens?token=eq.${encodeURIComponent(t)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
}
console.log(`Novità: ${fresh.length} (vecchie saltate: ${old.length}). Notifiche inviate: ${sent}. Telefoni rimossi: ${gone.length}.`)
