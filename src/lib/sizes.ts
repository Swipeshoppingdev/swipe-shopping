// Taglie dei capi e delle scarpe Amazon.
// La ricerca Amazon restituisce una variante per taglia (titolo che finisce con ", M" o ", 42 EU"):
// clean-catalog unisce le varianti dello stesso articolo e ne raccoglie le taglie disponibili.
// Sono le taglie viste disponibili all'ultimo aggiornamento del catalogo, non in tempo reale.

export type SizeKind = 'abiti' | 'scarpe' | 'jeans'

export const SIZE_KINDS: { kind: SizeKind; label: string }[] = [
  { kind: 'abiti', label: 'Abbigliamento' },
  { kind: 'jeans', label: 'Jeans e pantaloni (vita)' },
  { kind: 'scarpe', label: 'Scarpe' },
]

const LETTERS = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', 'Unica']
const LETTER_ALIASES: Record<string, string> = {
  XXS: 'XXS', XS: 'XS', 'X-SMALL': 'XS', 'EXTRA SMALL': 'XS', S: 'S', SMALL: 'S', M: 'M', MEDIUM: 'M',
  L: 'L', LARGE: 'L', XL: 'XL', 'X-LARGE': 'XL', 'EXTRA LARGE': 'XL', XXL: 'XXL', 'XX-LARGE': 'XXL', '2XL': 'XXL',
  XXXL: '3XL', '3XL': '3XL', 'XXX-LARGE': '3XL', '4XL': '4XL', XXXXL: '4XL', '5XL': '5XL',
  'TAGLIA UNICA': 'Unica', 'ONE SIZE': 'Unica', 'EINHEITSGRÖSSE': 'Unica', 'EINHEITSGROSSE': 'Unica', UNICA: 'Unica',
}

const SHOE_CATEGORIES = new Set(['sneakers', 'scarpe_eleganti', 'scarpe_sportive', 'stivali', 'sandali', 'pantofole'])
const CLOTHES_CATEGORIES = new Set(['tshirt', 'felpe', 'maglioni', 'camicie', 'pantaloni', 'jeans', 'giacche', 'cappotti', 'vestiti', 'sportivo', 'gonne', 'pigiami'])

/** Le categorie che hanno taglie (capi e scarpe). */
export const hasSizes = (category: string) => SHOE_CATEGORIES.has(category) || CLOTHES_CATEGORIES.has(category)

export function sizeKind(size: string): SizeKind {
  if (/^W\d/.test(size)) return 'jeans'
  if (/^\d{2}(\.5)?$/.test(size)) return 'scarpe'
  return 'abiti'
}

/** Valore del filtro per una taglia: le mezze misure delle scarpe contano come il numero intero (42.5 → 42). */
export const sizeChip = (size: string) => (sizeKind(size) === 'scarpe' ? String(Math.floor(Number(size))) : size)

const rank = (s: string) => {
  const kind = sizeKind(s)
  if (kind === 'abiti') return LETTERS.indexOf(s)
  return Number(s.replace(/^W/, ''))
}
export const sortSizes = (sizes: Iterable<string>) => [...new Set(sizes)].sort((a, b) => rank(a) - rank(b))

/**
 * Taglia scritta in fondo al titolo Amazon: "…, Nero, XL" → { base: "…, Nero", size: "XL" }.
 * Solo per capi e scarpe; se in fondo non c'è una taglia riconoscibile ritorna null.
 */
export function splitSize(title: string, category: string): { base: string; size: string } | null {
  if (!hasSizes(category)) return null
  // Alcune scarpe Geox e simili: "… Moccasins Black 39.5_EU", senza virgola.
  const eu = SHOE_CATEGORIES.has(category) ? title.match(/^(.{10,}?)\s+(\d{2})(?:[.,](5))?_EU$/) : null
  if (eu) {
    const n = Number(eu[2])
    return n >= 34 && n <= 49 ? { base: eu[1].trim(), size: eu[3] ? `${n}.5` : String(n) } : null
  }
  const at = title.lastIndexOf(',')
  if (at < 10) return null
  const tail = title.slice(at + 1).trim().replace(/\s+(donna|uomo|unisex)$/i, '').replace(/[()]/g, '').trim()
  const base = title.slice(0, at).trim()
  if (SHOE_CATEGORIES.has(category)) {
    // "42 EU", "42", "42.5 EU", "42,5", "40 2/3 EU"
    const m = tail.match(/^(\d{2})(?:[.,](5)| (1\/2|1\/3|2\/3))?(?:\s*EU)?$/i)
    if (!m) return null
    const n = Number(m[1])
    if (n < 34 || n > 49) return null
    return { base, size: m[2] || m[3] === '1/2' ? `${n}.5` : String(n) }
  }
  // Jeans e pantaloni con la vita: "32W x 32L", "W32 L34", "32W/30L"
  const w = tail.match(/^(?:W\s?(\d{2})|(\d{2})\s?W)\b/i)
  if (w) {
    const n = Number(w[1] ?? w[2])
    return n >= 24 && n <= 44 ? { base, size: `W${n}` } : null
  }
  const letter = LETTER_ALIASES[tail.toUpperCase()]
  return letter ? { base, size: letter } : null
}

/**
 * Il prodotto va bene per le taglie scelte? Per ogni tipo (abiti, scarpe, jeans) conta solo la scelta di quel tipo;
 * i prodotti senza taglie note restano sempre (non sappiamo, meglio non nasconderli).
 * `selected` è l'elenco verde/rosso dei filtri: vuoto = tutto; `nessuno:<tipo>` = escluso tutto quel tipo.
 */
export function matchesSizes(sizes: string[] | undefined, selected: string[]) {
  if (!selected.length || !sizes?.length) return true
  const kind = sizeKind(sizes[0])
  if (selected.includes(`nessuno:${kind}`)) return false
  const chosen = selected.filter((s) => !s.startsWith('nessuno:') && sizeKind(s) === kind)
  if (!chosen.length) return true
  return sizes.some((s) => chosen.includes(sizeChip(s)))
}

/** Le taglie scelte dall'utente che risultano disponibili per il prodotto (vuoto = nessuna conferma). */
export function fitSizes(sizes: string[] | undefined, mine: string[]) {
  if (!sizes?.length || !mine.length) return []
  return sortSizes(sizes.filter((s) => mine.includes(sizeChip(s))))
}
