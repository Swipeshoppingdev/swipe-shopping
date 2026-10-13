import type { Product } from '../types/product'

/**
 * "Nuovo" = entrato in catalogo negli ultimi 7 giorni. I prodotti del primo caricamento
 * (tutti con la stessa data) non contano: altrimenti all'inizio sarebbe tutto nuovo.
 */
const NEW_DAYS = 7
let baseline = Infinity
const added = new WeakMap<Product, number>()

export function setNewBaseline(products: Product[]) {
  let min = Infinity
  for (const p of products) {
    // La data letta qui serve anche a isNew: così si legge una volta sola per prodotto.
    let t = added.get(p)
    if (t === undefined) {
      t = Date.parse(p.addedAt)
      added.set(p, t)
    }
    if (t < min) min = t
  }
  baseline = min + 24 * 3_600_000
}

export function isNew(p: Product, now = Date.now()) {
  let t = added.get(p)
  if (t === undefined) {
    t = Date.parse(p.addedAt)
    added.set(p, t)
  }
  return t > baseline && now - t < NEW_DAYS * 24 * 3_600_000
}
