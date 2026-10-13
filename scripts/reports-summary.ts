/**
 * Riepilogo delle segnalazioni dei prodotti (schema-12.sql) nel log dell'aggiornamento del catalogo:
 * serve a correggere le regole della ricerca (categorie, marche, foto). Solo id e motivi, nessun dato personale.
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hlsqxxcztysnlijznjng.supabase.co'
const { SUPABASE_SERVICE_ROLE_KEY } = process.env

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.log('Segnalazioni: manca il secret SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(0)
}
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data, error } = await db.from('product_reports').select('product_id, reason').limit(5000)
if (error) {
  console.log(`Segnalazioni non lette: ${error.message}`)
  process.exit(0)
}
const byProduct = new Map<string, Record<string, number>>()
for (const r of data ?? []) {
  const m = byProduct.get(r.product_id) ?? {}
  m[r.reason] = (m[r.reason] ?? 0) + 1
  byProduct.set(r.product_id, m)
}
console.log(`::notice::Segnalazioni: ${data?.length ?? 0} su ${byProduct.size} prodotti.`)
// Codici puliti: arrivano da chiunque e nel log "::comando::" verrebbe eseguito da GitHub.
for (const [id, reasons] of byProduct) console.log(`  ${id.replace(/[^\w.:-]/g, '?')}: ${Object.entries(reasons).map(([k, n]) => `${k}×${n}`).join(' ')}`)

// Errori dell'app arrivati dai telefoni (schema-16.sql): anonimi, solo il testo tecnico. Puliti come sopra.
const errs = await db.from('app_errors').select('happened_at, kind, message, stack, route, native').order('happened_at', { ascending: false }).limit(20)
if (errs.error) console.log(`Errori dell'app non letti: ${errs.error.message}`)
else {
  console.log(`Errori dell'app (ultimi ${errs.data.length}):`)
  const clean = (s: string | null) => (s ?? '').replace(/::/g, ': :').replace(/[^\x20-\x7e\nÀ-ſ]/g, '?')
  for (const e of errs.data) console.log(`  ${e.happened_at} [${clean(e.kind)}] ${e.native ? 'app' : 'web'} ${clean(e.route)}\n    ${clean(e.message)}\n    ${clean(e.stack).split('\n').slice(0, 8).join('\n    ')}`)
}
