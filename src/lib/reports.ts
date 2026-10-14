import { load, save } from './storage'
import { getSupabase } from './supabase'

/** Motivi per segnalare un prodotto: solo scelte già pronte, niente testo scritto. */
export const REPORT_REASONS = [
  { id: 'foto', label: 'La foto è sbagliata' },
  { id: 'categoria', label: 'Categoria o genere sbagliato' },
  { id: 'link', label: 'Il link non funziona' },
  { id: 'prezzo', label: 'Il prezzo è diverso sul negozio' },
  { id: 'esaurito', label: 'Non è disponibile' },
] as const
export type ReportReason = (typeof REPORT_REASONS)[number]['id']
export const reasonLabel = (id: string) => REPORT_REASONS.find((r) => r.id === id)?.label ?? id

const KEY = 'reported'

/** Prodotti già segnalati da questo dispositivo (una segnalazione per prodotto). */
export const alreadyReported = (id: string) => load<string[]>(KEY, []).includes(id)

export async function reportProduct(productId: string, reason: ReportReason) {
  save(KEY, [...load<string[]>(KEY, []), productId].slice(-500))
  const supabase = await getSupabase()
  if (!supabase) return
  await supabase.rpc('report_product', { p_product_id: productId, p_reason: reason })
}

export interface ReportRow {
  id: string
  n: number
  reasons: Record<string, number>
  last: string
}
