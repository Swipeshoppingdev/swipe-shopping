// Avviso "novità dalle tue marche": chi segue una marca (user_data.follows, schema-17.sql) riceve una notifica
// quando nel catalogo entrano prodotti nuovi di quella marca. Solo notifiche (app Android o sito), niente email.
// Regole: al massimo una al giorno per persona (20 ore), solo dalle 9 alle 21 (ora di Roma), solo prodotti
// disponibili ed entrati dopo l'ultimo avviso (e negli ultimi 2 giorni). Testo fisso con i nomi delle marche.
// Gira su GitHub Actions dopo l'aggiornamento del catalogo. Uso: `node scripts/brand-alerts.ts` (`--dry` = prova).
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { pushSender } from './webpush.ts'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hlsqxxcztysnlijznjng.supabase.co'
const { SUPABASE_SERVICE_ROLE_KEY, FCM_SERVICE_ACCOUNT } = process.env
const DRY = process.argv.includes('--dry')
const GAP_MS = 20 * 3_600_000
const WINDOW_MS = 48 * 3_600_000

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.log('::notice::Avvisi marche non attivi: manca il secret SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(0)
}
const now = Date.now()
const romeHour = Number(new Intl.DateTimeFormat('it-IT', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Rome' }).format(now))
if (romeHour < 9 || romeHour >= 21) {
  console.log('Avvisi marche: di notte non si manda niente (si riprova al prossimo aggiornamento).')
  process.exit(0)
}

interface Product {
  brand?: string
  addedAt?: string
  availability?: string
}
const norm = (b: string) => b.trim().toLowerCase()
const catalog = JSON.parse(readFileSync(new URL('../public/catalog.json', import.meta.url), 'utf8')) as Product[]
/** marca → date di arrivo dei prodotti nuovi disponibili */
const fresh = new Map<string, { name: string; added: number[] }>()
for (const p of catalog) {
  const at = p.addedAt ? Date.parse(p.addedAt) : NaN
  if (!p.brand || p.availability === 'out_of_stock' || !(now - at < WINDOW_MS)) continue
  const k = norm(p.brand)
  const e = fresh.get(k) ?? { name: p.brand.trim(), added: [] }
  e.added.push(at)
  fresh.set(k, e)
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
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

let users: { user_id: string; follows: unknown }[]
let last: Map<string, number>
let tokens: { token: string; user_id: string }[]
try {
  users = await all('user_data', 'user_id, follows', (q) => q.neq('follows', '[]'))
  last = new Map((await all<{ user_id: string; last_sent_at: string }>('brand_alerts', 'user_id, last_sent_at')).map((r) => [r.user_id, Date.parse(r.last_sent_at)]))
  tokens = await all('push_tokens', 'token, user_id')
} catch (e) {
  console.log(`::notice::Avvisi marche non disponibili (serve schema-17.sql): ${e instanceof Error ? e.message : e}`)
  process.exit(0)
}

const send = DRY ? null : await pushSender('marche', { fcm: FCM_SERVICE_ACCOUNT, seed: SUPABASE_SERVICE_ROLE_KEY })
let sent = 0
for (const u of users) {
  const phones = tokens.filter((t) => t.user_id === u.user_id && (FCM_SERVICE_ACCOUNT || t.token.startsWith('{')))
  if (phones.length === 0) continue
  const since = last.get(u.user_id) ?? 0
  if (now - since < GAP_MS) continue
  const brands = (Array.isArray(u.follows) ? u.follows : []).filter((b): b is string => typeof b === 'string')
  const hits = brands
    .map((b) => fresh.get(norm(b)))
    .filter((e) => !!e)
    .map((e) => ({ name: e.name, count: e.added.filter((at) => at > since).length }))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count)
  if (hits.length === 0) continue
  const total = hits.reduce((n, h) => n + h.count, 0)
  const names = hits.length === 1 ? hits[0].name : hits.length === 2 ? `${hits[0].name} e ${hits[1].name}` : `${hits[0].name}, ${hits[1].name} e altre`
  const m = {
    title: total === 1 ? `Novità da ${names}` : `${total} novità da ${names}`,
    body: 'Le trovi tra le prime carte, scorri per vederle',
    url: '#/scopri',
  }
  if (!send) {
    console.log(`[prova] ${m.title}`)
    continue
  }
  let ok = false
  for (const p of phones) {
    const r = await send(p.token, m)
    if (r === 'ok') ok = true
    if (r === 'gone') await db.from('push_tokens').delete().eq('token', p.token)
  }
  if (!ok) continue
  sent++
  const { error } = await db.from('brand_alerts').upsert({ user_id: u.user_id, last_sent_at: new Date().toISOString() })
  if (error) console.log(`::warning::brand_alerts: ${error.message}`)
}
console.log(`Avvisi marche: ${sent} notifiche (${users.length} account seguono almeno una marca, ${fresh.size} marche con novità).`)
