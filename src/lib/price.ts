import { STORES } from '../config/stores.ts'
import type { Product } from '../types/product'

const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
export const formatPrice = (value: number) => eur.format(value)

// Data del controllo letta una volta per prodotto (e per valore): freshPrice si chiama moltissime volte a ogni render.
const checkedCache = new WeakMap<Product, [string, number]>()
function checkedTime(p: Product, at: string) {
  const c = checkedCache.get(p)
  if (c && c[0] === at) return c[1]
  const t = Date.parse(at)
  checkedCache.set(p, [at, t])
  return t
}

/** Un prezzo si mostra solo se è stato verificato entro la finestra consentita dal negozio. */
export function freshPrice(p: Product, now = Date.now()) {
  if (p.price === undefined || !p.priceCheckedAt) return null
  const checked = checkedTime(p, p.priceCheckedAt)
  const maxAge = STORES[p.store].priceMaxAgeHours * 3_600_000
  if (Number.isNaN(checked) || now - checked > maxAge) return null
  const discounted = p.originalPrice !== undefined && p.originalPrice > p.price
  return {
    price: p.price,
    originalPrice: discounted ? p.originalPrice : undefined,
    discountPct: discounted ? Math.round((1 - p.price / p.originalPrice!) * 100) : undefined,
    checkedAt: new Date(checked),
    from: p.priceFrom === true,
  }
}

/** Sconto da mostrare come badge sulla foto (sotto il 5% non vale la pena). */
export function discountBadge(p: Product) {
  const pct = freshPrice(p)?.discountPct
  return pct !== undefined && pct >= 5 ? pct : null
}

/** "Ultimi pezzi": solo se Amazon lo ha detto insieme a un prezzo ancora valido. */
export const fewLeft = (p: Product, now = Date.now()) => p.fewLeft === true && p.availability === 'in_stock' && freshPrice(p, now) !== null

/** Offerta a tempo ancora in corso (con prezzo valido): etichetta e millisecondi alla fine, se Amazon la dice. */
export function timedDeal(p: Product, now = Date.now()) {
  if (!p.dealBadge || p.availability !== 'in_stock' || !freshPrice(p, now)) return null
  const left = p.dealEndsAt ? Date.parse(p.dealEndsAt) - now : NaN
  if (left <= 0) return null
  return { badge: p.dealBadge, left: Number.isNaN(left) ? null : left }
}
