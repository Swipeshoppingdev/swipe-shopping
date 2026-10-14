import type { Product } from '../types/product'

/**
 * "Nuovo" = entrato in catalogo negli ultimi 7 giorni. I prodotti del primo caricamento
 * (tutti con la stessa data) non contano: altrimenti all'inizio sarebbe tutto nuovo.
 */
const NEW_DAYS = 7
// Le date sono stringhe ISO in UTC ("2026-10-09T08:58:00Z"): si confrontano come testo, che è molto più veloce
// di leggerle come date per decine di migliaia di prodotti (l'ordine alfabetico è quello cronologico).
let baseline = '\uffff'
const iso = (t: number) => new Date(t).toISOString()
const isIsoUtc = (s: string) => s.length >= 20 && s.charCodeAt(s.length - 1) === 90 /* Z */ && s.charCodeAt(10) === 84 /* T */

export function setNewBaseline(products: Product[]) {
  let min = '\uffff'
  for (const p of products) {
    const a = isIsoUtc(p.addedAt) ? p.addedAt : iso(Date.parse(p.addedAt))
    if (a < min) min = a
  }
  baseline = min === '\uffff' ? min : iso(Date.parse(min) + 24 * 3_600_000)
}

let weekAgo = { at: 0, iso: '' }
export function isNew(p: Product, now = Date.now()) {
  // La soglia "7 giorni fa" si ricalcola al massimo una volta al minuto.
  if (now - weekAgo.at > 60_000) weekAgo = { at: now, iso: iso(now - NEW_DAYS * 24 * 3_600_000) }
  const a = isIsoUtc(p.addedAt) ? p.addedAt : iso(Date.parse(p.addedAt))
  return a > baseline && a > weekAgo.iso
}
