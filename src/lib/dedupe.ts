import type { Product } from '../types/product'

/**
 * Le prime `n` parole del titolo (minuscole, senza accenti, solo lettere e cifre).
 * Si fermano alla settima invece di dividere tutto il titolo: con decine di migliaia di prodotti conta.
 */
function firstWords(t: string, n: number) {
  let s = t.toLowerCase()
  // eslint-disable-next-line no-control-regex
  if (/[^\x00-\x7f]/.test(s)) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const re = /[a-z0-9]+/g
  const out: string[] = []
  for (let m = re.exec(s); m && out.length < n; m = re.exec(s)) out.push(m[0])
  return out.join(' ')
}

/**
 * Chiave del "modello": stesso negozio, marca, categoria e prime 7 parole del titolo.
 * Le varianti di colore o taglia ("Hoodie Nike Park26 … Black/White XXL") hanno la stessa chiave.
 */
export const modelKey = (p: Product) => {
  // Calcolata una volta per prodotto: il mazzo la richiede a ogni swipe.
  let k = keys.get(p)
  if (k === undefined) {
    k = `${p.store}|${p.brand ?? ''}|${p.category}|${firstWords(p.title, 7)}`
    keys.set(p, k)
  }
  return k
}
const keys = new WeakMap<Product, string>()

