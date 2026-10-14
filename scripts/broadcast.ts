// Comunicazioni scritte a mano dal titolare nella pagina Statistiche (#/admin), salvate in Supabase
// (tabella broadcasts, vedi supabase/schema-3.sql). Questo script gira su GitHub Actions ogni 10 minuti:
// prende quelle in coda e le manda con Resend a tutti gli account confermati che non le hanno spente.
// - Le "prove" vanno solo all'email del titolare.
// - Niente link Amazon nelle email (regole Amazon Associates): se ci sono, l'invio viene bloccato.
// - Se Resend si ferma (limite giornaliero), la volta dopo si riparte da chi non l'ha ancora ricevuta.
// Uso: `node scripts/broadcast.ts` (con `--dry` mostra a chi andrebbe, senza inviare).
import { isAdminEmail } from '../src/lib/admin.ts'
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hlsqxxcztysnlijznjng.supabase.co'
const { SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY } = process.env
const DRY = process.argv.includes('--dry')
const FROM = 'Swipe Shopping <noreply@swipeshopping.app>'
const APP_URL = 'https://swipeshopping.app'
// I log di GitHub sono pubblici: nessun indirizzo email, nemmeno in parte.
const mask = (s: string) => s.replace(/[^\s@"'<>,;:]+@[^\s@"'<>,;:]+/g, '***')

if (!SUPABASE_SERVICE_ROLE_KEY || (!RESEND_API_KEY && !DRY)) {
  console.log('::notice::Comunicazioni non attive: mancano i secrets SUPABASE_SERVICE_ROLE_KEY e/o RESEND_API_KEY.')
  process.exit(0)
}

interface Broadcast {
  id: number
  subject: string
  body: string
  test: boolean
  status: 'pending' | 'sending'
  sent_to: string[]
  sent_count: number
}

const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' }

async function rest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}${path}`, { ...init, headers: { ...headers, ...init?.headers } })
  if (!res.ok) throw new Error(`${path.split('?')[0]}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
  return (res.status === 204 ? null : await res.json()) as T
}
const update = (id: number, patch: Record<string, unknown>) =>
  rest(`/rest/v1/broadcasts?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(patch), headers: { Prefer: 'return=minimal' } })

let queue: Broadcast[]
try {
  queue = await rest<Broadcast[]>('/rest/v1/broadcasts?status=in.(pending,sending)&order=id.asc&select=*')
} catch (e) {
  // Tabella assente: lo script SQL non è ancora stato eseguito.
  console.log(`::notice::Comunicazioni non disponibili: ${e instanceof Error ? e.message : e}`)
  process.exit(0)
}
if (queue.length === 0) {
  console.log('Nessuna comunicazione in coda.')
  process.exit(0)
}

/** Account confermati che non hanno spento le comunicazioni. */
async function recipients(): Promise<{ id: string; email: string }[]> {
  const optedOut = new Set(
    (await rest<{ user_id: string }[]>('/rest/v1/user_data?select=user_id&email_news=eq.false')).map((r) => r.user_id),
  )
  const out: { id: string; email: string }[] = []
  for (let page = 1; ; page++) {
    const { users } = await rest<{ users: { id: string; email?: string; email_confirmed_at?: string | null }[] }>(
      `/auth/v1/admin/users?page=${page}&per_page=1000`,
    )
    for (const u of users) if (u.email && u.email_confirmed_at && !optedOut.has(u.id)) out.push({ id: u.id, email: u.email })
    if (users.length < 1000) return out
  }
}

/** Le prove vanno solo all'amministratore, trovato tra gli account dall'impronta della sua email (src/lib/admin.ts). */
async function adminRecipient(): Promise<{ id: string; email: string }[]> {
  for (let page = 1; ; page++) {
    const { users } = await rest<{ users: { id: string; email?: string }[] }>(`/auth/v1/admin/users?page=${page}&per_page=1000`)
    const admin = users.find((u) => isAdminEmail(u.email))
    if (admin?.email) return [{ id: 'test', email: admin.email }]
    if (users.length < 1000) return []
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const linkify = (s: string) => s.replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:#f43f5e">${u}</a>`)

function email(b: Broadcast) {
  const paragraphs = b.body
    .trim()
    .split(/\n\s*\n/)
    .map((p) => `<p style="font-size:15px;line-height:1.6;color:#404040;margin:0 0 16px;text-align:left">${linkify(esc(p)).replace(/\n/g, '<br>')}</p>`)
    .join('')
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f5f5;padding:32px 16px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:20px;padding:32px 28px;text-align:center">
    <img src="${APP_URL}/icons/icon-192.png" width="64" height="64" alt="Swipe Shopping" style="border-radius:14px">
    <h1 style="font-size:22px;color:#171717;margin:20px 0 16px">${esc(b.subject)}</h1>
    ${paragraphs}
    <a href="${APP_URL}" style="display:inline-block;margin-top:8px;background:#f43f5e;color:#fff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 28px;border-radius:999px">Apri Swipe Shopping</a>
    <p style="font-size:12px;line-height:1.5;color:#a3a3a3;margin:28px 0 0">Ricevi questa email perché hai un account su Swipe Shopping.<br><a href="${APP_URL}/#/profilo" style="color:#a3a3a3">Non voglio più ricevere comunicazioni</a></p>
  </div>
</div>`
  const text = `${b.subject}\n\n${b.body.trim()}\n\nApri Swipe Shopping: ${APP_URL}\n\nNon vuoi più ricevere comunicazioni? Spegnile dal Profilo: ${APP_URL}/#/profilo`
  return { html, text }
}

async function send(to: string, b: Broadcast): Promise<'ok' | 'stop' | 'skip'> {
  const { html, text } = email(b)
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject: b.subject, html, text, headers: { 'List-Unsubscribe': `<${APP_URL}/#/profilo>` } }),
  })
  if (res.ok) return 'ok'
  const detail = (await res.text()).slice(0, 300)
  console.log(`::warning::Email non inviata (${res.status}): ${mask(detail)}`)
  // 429 = troppe email (anche il limite giornaliero di Resend): ci si ferma e si riprende al prossimo giro.
  return res.status === 429 ? 'stop' : 'skip'
}

for (const b of queue) {
  if (/\b(?:amazon\.[a-z.]+|amzn\.(?:to|eu))\b/i.test(`${b.subject} ${b.body}`)) {
    await update(b.id, { status: 'failed', error: 'Niente link Amazon nelle email (regole Amazon Associates).' })
    console.log(`::warning::Comunicazione ${b.id} bloccata: contiene un link Amazon.`)
    continue
  }
  const all = b.test ? await adminRecipient() : await recipients()
  const done = new Set(b.sent_to ?? [])
  const todo = all.filter((r) => !done.has(r.id))
  console.log(`Comunicazione ${b.id}${b.test ? ' (prova)' : ''}: "${b.subject}" → ${todo.length} da inviare su ${all.length}.`)
  if (DRY) {
    console.log(`[prova] ${todo.length} destinatari (indirizzi nascosti).`)
    continue
  }
  await update(b.id, { status: 'sending', total: all.length })
  let stopped = false
  let sinceSave = 0
  for (const r of todo) {
    const result = await send(r.email, b)
    if (result === 'stop') {
      stopped = true
      break
    }
    if (result === 'ok') {
      done.add(r.id)
      sinceSave++
    }
    // Salvo i progressi ogni 20 invii: se il job si interrompe non si manda due volte.
    if (sinceSave >= 20) {
      await update(b.id, { sent_to: [...done], sent_count: done.size })
      sinceSave = 0
    }
    await new Promise((res) => setTimeout(res, 600)) // Resend: max 2 richieste al secondo
  }
  await update(b.id, {
    sent_to: [...done],
    sent_count: done.size,
    ...(stopped ? { error: 'Limite di invio raggiunto: riprendo al prossimo giro.' } : { status: 'sent', sent_at: new Date().toISOString(), error: null }),
  })
  console.log(`Comunicazione ${b.id}: ${done.size}/${all.length} inviate${stopped ? ' (in pausa per il limite di Resend)' : ''}.`)
  if (stopped) break
}
