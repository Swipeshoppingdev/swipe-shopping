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
for (const [id, reasons] of byProduct) console.log(`  ${id}: ${Object.entries(reasons).map(([k, n]) => `${k}×${n}`).join(' ')}`)
