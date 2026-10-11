import { STORES } from '../config/stores.ts'
import type { Product } from '../types/product'

const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
export const formatPrice = (value: number) => eur.format(value)

/** Un prezzo si mostra solo se è stato verificato entro la finestra consentita dal negozio. */
export function freshPrice(p: Product, now = Date.now()) {
  if (p.price === undefined || !p.priceCheckedAt) return null
  const checked = Date.parse(p.priceCheckedAt)
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
