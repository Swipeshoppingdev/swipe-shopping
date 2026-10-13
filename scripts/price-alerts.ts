// Avviso "preferito in offerta": avvisa chi ha un preferito che oggi è scontato sul negozio.
// Chi ha l'app Android con le notifiche attive riceve una notifica sul telefono (solo dalle 9 alle 21),
// gli altri un'email. Mai entrambe: il limite di un avviso ogni 3 giorni vale per tutti e due.
// Non confrontiamo con prezzi vecchi: le regole Amazon non permettono di conservarli oltre 24 ore.
// Gira su GitHub Actions dopo l'aggiornamento del catalogo. Regole:
// - al massimo un'email ogni 3 giorni per persona, mai due volte per la stessa offerta
//   (di nuovo solo se lo sconto sale di almeno 5 punti, o se l'offerta finisce e poi ritorna);
// - solo account confermati che non hanno spento gli avvisi dal Profilo;
// - niente link affiliati, prezzi o testi Amazon nell'email (regole Amazon Associates):
//   l'email porta all'app, dove il prezzo aggiornato si vede accanto al prodotto.
// Uso: `npm run alerts:price` (aggiungi `-- --dry` per vedere chi riceverebbe l'email senza inviarla,
// oppure `-- --test=indirizzo@email.it` per mandare solo un'email di esempio a quell'indirizzo).
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { FCM_SCOPE, accessToken, fcmSender, type ServiceAccount } from './google.ts'
// I log di GitHub sono pubblici: nessun indirizzo email, nemmeno in parte.
const mask = (s: string) => s.replace(/[^\s@"'<>,;:]+@[^\s@"'<>,;:]+/g, '***')

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hlsqxxcztysnlijznjng.supabase.co'
const { SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, FCM_SERVICE_ACCOUNT } = process.env
const DRY = process.argv.includes('--dry')
const TEST_TO = process.argv.find((a) => a.startsWith('--test='))?.slice('--test='.length).trim()
const FROM = 'Swipe Shopping <noreply@swipeshopping.app>'
const APP_URL = 'https://swipeshopping.app'
const MIN_GAP_MS = 3 * 24 * 3_600_000
const WATCH_GAP_MS = 20 * 3_600_000
const WATCH_FOLDER = 'Quando scende' // src/config/folders.ts
const PRICE_MAX_AGE_MS = 24 * 3_600_000

if (TEST_TO !== undefined && (!RESEND_API_KEY || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(TEST_TO))) {
  console.log('::error::Email di prova: serve RESEND_API_KEY e un indirizzo valido.')
  process.exit(1)
}
if (TEST_TO === undefined && (!SUPABASE_SERVICE_ROLE_KEY || (!RESEND_API_KEY && !DRY))) {
  console.log('::notice::Avvisi prezzo non attivi: mancano i secrets SUPABASE_SERVICE_ROLE_KEY e/o RESEND_API_KEY.')
  process.exit(0)
}

interface Product {
  id: string
  price?: number
  originalPrice?: number
  priceCheckedAt?: string
  availability?: string
}
interface WishItem {
  product: { id: string }
}

const catalog = JSON.parse(readFileSync(new URL('../public/catalog.json', import.meta.url), 'utf8')) as Product[]
const byId = new Map(catalog.map((p) => [p.id, p]))
const now = Date.now()

/** Sconto attuale in % (almeno 5%, prezzo verificato nelle ultime 24 ore), come il badge dell'app. */
function currentDeal(id: string) {
  const p = byId.get(id)
  if (!p || p.availability === 'out_of_stock' || p.price === undefined || !p.originalPrice || !p.priceCheckedAt) return null
  if (now - Date.parse(p.priceCheckedAt) > PRICE_MAX_AGE_MS || p.originalPrice <= p.price) return null
  const pct = Math.round((1 - p.price / p.originalPrice) * 100)
  return pct >= 5 ? pct : null
}

async function all<T>(table: string, columns: string, filter?: (q: any) => any): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(columns).range(from, from + 999)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data as T[]))
    if (!data || data.length < 1000) return rows
  }
}

function email(count: number, watching = false) {
  const subject = watching
    ? count === 1 ? 'Quello che aspettavi è in offerta' : `${count} prodotti che aspettavi sono in offerta`
    : count === 1 ? 'Un tuo preferito è in offerta' : `${count} tuoi preferiti sono in offerta`
  const intro =
    count === 1
      ? 'Uno dei prodotti che hai salvato nei preferiti adesso è scontato.'
      : `${count} prodotti che hai salvato nei preferiti adesso sono scontati.`
  const link = `${APP_URL}/#/preferiti`
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f5f5;padding:32px 16px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:20px;padding:32px 28px;text-align:center">
    <img src="${APP_URL}/icons/icon-192.png" width="72" height="72" alt="Swipe Shopping" style="border-radius:16px">
    <h1 style="font-size:22px;color:#171717;margin:20px 0 8px">${subject}</h1>
    <p style="font-size:15px;line-height:1.5;color:#525252;margin:0 0 24px">${intro} Aprili nell’app per vedere lo sconto prima che finisca.</p>
    <a href="${link}" style="display:inline-block;background:#f43f5e;color:#fff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 28px;border-radius:999px">Vedi i miei preferiti</a>
    <p style="font-size:12px;line-height:1.5;color:#a3a3a3;margin:28px 0 0">Ricevi questa email perché hai un account su Swipe Shopping. Ti scriviamo solo quando un preferito va in offerta, al massimo una volta al giorno.<br><a href="${APP_URL}/#/profilo" style="color:#a3a3a3">Non voglio più questi avvisi</a></p>
  </div>
</div>`
  const text = `${subject}\n\n${intro}\nVedi i tuoi preferiti: ${link}\n\nNon vuoi più questi avvisi? Spegnili dal Profilo: ${APP_URL}/#/profilo`
  return { subject, html, text }
}

async function send(to: string, count: number, watching = false) {
  const { subject, html, text } = email(count, watching)
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject,
      html,
      text,
      headers: { 'List-Unsubscribe': `<${APP_URL}/#/profilo>` },
    }),
  })
  if (!res.ok) console.log(`::warning::Email non inviata (${res.status}): ${mask((await res.text()).slice(0, 300))}`)
  return res.ok
}

if (TEST_TO !== undefined) {
  const ok = await send(TEST_TO, 2)
  console.log(ok ? `Email di prova inviata a ${mask(TEST_TO)}.` : 'Email di prova non inviata.')
  process.exit(ok ? 0 : 1)
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const users = await all<{ user_id: string; wishlist: WishItem[] }>('user_data', 'user_id, wishlist', (q) => q.eq('email_alerts', true))
const sentLog = new Map(
  (await all<{ user_id: string; last_sent_at: string | null; notified: Record<string, number> }>('price_alerts', 'user_id, last_sent_at, notified')).map(
    (r) => [r.user_id, r],
  ),
)

// Telefoni con le notifiche attive (schema-6.sql). Senza tabella o senza chiave Firebase: solo email.
const phones = new Map<string, string[]>()
let push: ReturnType<typeof fcmSender> | null = null
if (FCM_SERVICE_ACCOUNT) {
  try {
    for (const t of await all<{ token: string; user_id: string }>('push_tokens', 'token, user_id'))
      phones.set(t.user_id, [...(phones.get(t.user_id) ?? []), t.token])
    if (!DRY) {
      const sa = JSON.parse(FCM_SERVICE_ACCOUNT) as ServiceAccount
      push = fcmSender(sa, await accessToken(sa, FCM_SCOPE))
    }
  } catch (e) {
    console.log(`::notice::Notifiche offerte non disponibili: ${e instanceof Error ? e.message : e}`)
    phones.clear()
  }
}
const romeHour = Number(new Intl.DateTimeFormat('it-IT', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Rome' }).format(now))
const quiet = romeHour < 9 || romeHour >= 21

/** Notifica sul telefono, testo fisso. true se è arrivata ad almeno un telefono. */
async function notifyPhones(userId: string, count: number, watching = false) {
  const m = {
    title: watching
      ? count === 1 ? 'Quello che aspettavi è in offerta' : `${count} prodotti che aspettavi sono in offerta`
      : count === 1 ? 'Un tuo preferito è in offerta' : `${count} tuoi preferiti sono in offerta`,
    body: 'Guardali prima che lo sconto finisca',
    url: '#/preferiti',
  }
  if (DRY || !push) return (console.log(`[prova] notifica: ${m.title}`), true)
  let ok = false
  for (const token of phones.get(userId) ?? []) {
    const r = await push(token, m)
    if (r === 'ok') ok = true
    if (r === 'gone') await db.from('push_tokens').delete().eq('token', token)
  }
  return ok
}

let sent = 0
let pushed = 0
let failed = 0
for (const u of users) {
  const log = sentLog.get(u.user_id)
  // Offerte già segnalate: id → sconto %. Le offerte finite si dimenticano, così se tornano si avvisa di nuovo.
  const before: Record<string, number> = (log?.notified as { deals?: Record<string, number> } | undefined)?.deals ?? {}
  const active: Record<string, number> = {}
  const fresh: Record<string, number> = {}
  // Cartella "Quando scende": chi la usa riceve avvisi solo per quei prodotti (meno avvisi, più utili),
  // e al massimo uno al giorno invece che ogni 3 giorni. Chi non la usa: tutti i preferiti, come prima.
  const items = Array.isArray(u.wishlist) ? u.wishlist : []
  const watched = items.filter((w) => (w as { folder?: string })?.folder === WATCH_FOLDER)
  const watching = watched.length > 0
  for (const w of watching ? watched : items) {
    const id = w?.product?.id
    const pct = id ? currentDeal(id) : null
    if (!id || pct === null) continue
    if (before[id] !== undefined) active[id] = before[id]
    if (before[id] === undefined || pct >= before[id] + 5) fresh[id] = pct
  }
  const forgotten = Object.keys(before).some((id) => active[id] === undefined)
  const waiting = log?.last_sent_at && now - Date.parse(log.last_sent_at) < (watching ? WATCH_GAP_MS : MIN_GAP_MS)
  const count = Object.keys(fresh).length
  if (count === 0 || waiting) {
    if (forgotten && log) await db.from('price_alerts').update({ notified: { deals: active } }).eq('user_id', u.user_id)
    continue
  }

  let viaPhone = false
  if (phones.has(u.user_id)) {
    // Di notte niente notifiche: si aspetta il prossimo aggiornamento del catalogo.
    if (quiet) continue
    viaPhone = await notifyPhones(u.user_id, count, watching)
  }
  if (viaPhone) {
    if (DRY) continue
    pushed++
  } else {
    const { data, error } = await db.auth.admin.getUserById(u.user_id)
    const to = data?.user?.email
    if (error || !to || !data.user.email_confirmed_at) continue

    if (DRY) {
      console.log(`[prova] ${mask(to)}: ${email(count, watching).subject}`)
      continue
    }
    if (!(await send(to, count, watching))) {
      failed++
      continue
    }
    sent++
    await new Promise((r) => setTimeout(r, 600)) // Resend: max 2 richieste al secondo
  }
  const { error: upsertError } = await db
    .from('price_alerts')
    .upsert({ user_id: u.user_id, last_sent_at: new Date().toISOString(), notified: { deals: { ...active, ...fresh } } })
  if (upsertError) console.log(`::warning::price_alerts: ${upsertError.message}`)
}

console.log(`Avvisi offerte: ${pushed} notifiche, ${sent} email inviate${failed ? `, ${failed} non riuscite` : ''} (${users.length} account con avvisi attivi).`)
