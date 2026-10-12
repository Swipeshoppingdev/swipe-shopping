// "Il tuo stile": un ritratto divertente fatto con i "Sì" della Moda (preferiti e duelli vinti).
// Tutto sul telefono: categorie, colori e prezzi dei preferiti diventano percentuali di 6 stili.
// Non è un consiglio né cambia il mazzo: è solo uno specchio che cambia mentre si swipa.
import { universeOf } from '../config/categories'
import { freshPrice } from './price'
import type { Product } from '../types/product'

export type StyleId = 'street' | 'minimal' | 'elegante' | 'sportivo' | 'colorato' | 'lusso'

export const STYLES: Record<StyleId, { label: string; emoji: string; text: string; color: string }> = {
  street: { label: 'Street', emoji: '🛹', text: 'Sneakers, felpe e jeans: comodo ma sempre sul pezzo.', color: '#f97316' },
  minimal: { label: 'Minimal', emoji: '🤍', text: 'Pochi colori, linee pulite: meno è meglio.', color: '#737373' },
  elegante: { label: 'Elegante', emoji: '🎩', text: 'Camicie, cappotti e scarpe giuste: classe senza sforzo.', color: '#4f46e5' },
  sportivo: { label: 'Sportivo', emoji: '⚡', text: 'Sempre pronto a muoverti, anche quando esci.', color: '#16a34a' },
  colorato: { label: 'Colorato', emoji: '🌈', text: 'Il colore non ti fa paura: ti fai notare.', color: '#db2777' },
  lusso: { label: 'Lusso', emoji: '💎', text: 'Punti alto: qualità e marche che contano.', color: '#ca8a04' },
}

const CATEGORY_STYLE: Partial<Record<string, StyleId>> = {
  sneakers: 'street', felpe: 'street', jeans: 'street', cappellini: 'street', zaini: 'street', borselli: 'street',
  camicie: 'elegante', cappotti: 'elegante', vestiti: 'elegante', scarpe_eleganti: 'elegante', orologi: 'elegante',
  gioielli: 'elegante', cinture: 'elegante', borse: 'elegante', portafogli: 'elegante',
  sportivo: 'sportivo', scarpe_sportive: 'sportivo',
  tshirt: 'minimal', maglioni: 'minimal', pantaloni: 'minimal', giacche: 'minimal', occhiali: 'minimal',
}
const NEUTRAL = new Set(['Nero', 'Bianco', 'Grigio', 'Beige'])
const STRONG = new Set(['Rosso', 'Rosa', 'Viola', 'Giallo', 'Arancione', 'Azzurro', 'Verde', 'Multicolore', 'Oro'])

/** Quanti "Sì" in Moda servono per il primo ritratto. */
export const STYLE_MIN = 15

export interface StyleDna {
  count: number
  shares: { id: StyleId; pct: number }[]
  color?: string
  brand?: string
  /** Prezzo tipico (mediana) dei preferiti con prezzo */
  budget?: number
}

export function styleDna(liked: Product[]): StyleDna {
  const moda = liked.filter((p) => universeOf(p.category) === 'moda')
  const score: Record<StyleId, number> = { street: 0, minimal: 0, elegante: 0, sportivo: 0, colorato: 0, lusso: 0 }
  const colors = new Map<string, number>()
  const brands = new Map<string, number>()
  const prices: number[] = []
  for (const p of moda) {
    const s = CATEGORY_STYLE[p.category]
    if (s) score[s] += 2
    const cs = p.colors ?? []
    if (cs.some((c) => STRONG.has(c))) score.colorato += 2
    else if (cs.length && cs.every((c) => NEUTRAL.has(c))) score.minimal += 1
    const price = freshPrice(p)?.price
    if (price !== undefined) {
      prices.push(price)
      if (price >= 150) score.lusso += 2
    }
    for (const c of cs) colors.set(c, (colors.get(c) ?? 0) + 1)
    if (p.brand) brands.set(p.brand, (brands.get(p.brand) ?? 0) + 1)
  }
  const total = Object.values(score).reduce((a, b) => a + b, 0) || 1
  // Percentuali intere che sommano a 100 (resti più grandi prima).
  const raw = (Object.keys(score) as StyleId[]).map((id) => ({ id, exact: (score[id] * 100) / total }))
  const shares = raw.map((r) => ({ id: r.id, pct: Math.floor(r.exact), rest: r.exact % 1 }))
  let left = 100 - shares.reduce((a, s) => a + s.pct, 0)
  for (const s of [...shares].sort((a, b) => b.rest - a.rest)) if (left-- > 0 && score[s.id] > 0) s.pct++
  const top = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1])[0]?.[0]
  prices.sort((a, b) => a - b)
  return {
    count: moda.length,
    shares: shares.filter((s) => s.pct > 0).sort((a, b) => b.pct - a.pct).map(({ id, pct }) => ({ id, pct })),
    color: top(colors),
    brand: top(brands),
    budget: prices.length ? Math.round(prices[Math.floor(prices.length / 2)]) : undefined,
  }
}

/** Testo da condividere (fisso, con i numeri calcolati). */
export function styleShareText(dna: StyleDna) {
  const parts = dna.shares.slice(0, 3).map((s) => `${STYLES[s.id].emoji} ${s.pct}% ${STYLES[s.id].label}`)
  return `Il mio stile su Swipe Shopping: ${parts.join(', ')}. E il tuo? Scoprilo swipando:`
}

/** Settimana dell'anno (per confrontare lo stile con la settimana prima). */
export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
  const start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return `${t.getUTCFullYear()}-${Math.ceil(((+t - +start) / 86400000 + 1) / 7)}`
}
