import type { CategoryId } from '../config/categories'
import { freshPrice } from './price'
import { modelKey } from './dedupe'
import type { Product } from '../types/product'

/**
 * Outfit completi composti in automatico dal catalogo Moda: capi veri, con le loro foto affiancate
 * (le foto dei negozi non si modificano né si fondono). Stessi colori neutri + al massimo un colore acceso.
 */
export interface Outfit {
  id: string
  gender: 'uomo' | 'donna'
  style: OutfitStyle
  items: Product[]
}

export type OutfitStyle = 'casual' | 'elegante' | 'vestito'
export const STYLE_LABEL: Record<OutfitStyle, string> = { casual: 'Casual', elegante: 'Elegante', vestito: 'Con il vestito' }

type Slot = { cats: CategoryId[]; optional?: number }
const RECIPES: { style: OutfitStyle; genders: ('uomo' | 'donna')[]; slots: Slot[] }[] = [
  {
    style: 'casual',
    genders: ['uomo', 'donna'],
    slots: [
      { cats: ['tshirt', 'felpe', 'maglioni', 'camicie'] },
      { cats: ['jeans', 'pantaloni'] },
      { cats: ['sneakers'] },
      { cats: ['giacche'], optional: 0.5 },
      { cats: ['cappellini', 'zaini', 'orologi', 'occhiali'], optional: 0.5 },
    ],
  },
  {
    style: 'elegante',
    genders: ['uomo', 'donna'],
    slots: [
      { cats: ['camicie', 'maglioni'] },
      { cats: ['pantaloni'] },
      { cats: ['scarpe_eleganti', 'stivali'] },
      { cats: ['cappotti'], optional: 0.5 },
      { cats: ['cinture', 'orologi', 'borse'], optional: 0.6 },
    ],
  },
  {
    style: 'vestito',
    genders: ['donna'],
    slots: [
      { cats: ['vestiti'] },
      { cats: ['stivali', 'scarpe_eleganti', 'sneakers'] },
      { cats: ['borse'] },
      { cats: ['giacche', 'cappotti'], optional: 0.4 },
    ],
  },
]

/** Colori che stanno bene con tutto: ammesso al massimo un capo di un altro colore. */
const NEUTRAL = new Set(['Nero', 'Bianco', 'Grigio', 'Beige', 'Marrone', 'Blu'])
/** Ogni capo compare al massimo in tanti outfit */
const MAX_USES = 2
const MAX_PER_STYLE = 120

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7)
export const outfitId = (ids: string[]) => `o${(hash([...ids].sort().join('|')) >>> 0).toString(36)}`

/** Il colore principale di un capo (il primo nel titolo); senza colore riconosciuto il capo non entra negli outfit. */
const mainColor = (p: Product) => p.colors?.find((c) => c !== 'Multicolore')

// Il genere del catalogo a volte sbaglia (Amazon restituisce capi da donna cercando "uomo"): conta anche il titolo.
const FOR_WOMEN = /\b(donna|donne|women|womens|woman|lady|ragazza|petite)\b/i
const FOR_MEN = /\b(uomo|uomini|men|mens|man|ragazzo)\b/i
const WOMEN_BRANDS = new Set(['vero moda', 'only', 'liu jo', 'desigual'])
/** Mai negli outfit: pantaloncini, costumi, pigiami, capi per bambini */
const NEVER = /\b(shorts?|bermuda|pantaloncin\w*|costum\w*|pigiama|bambin\w*|kids?|junior|neonat\w*)\b/i
/** Non stanno in un outfit elegante */
const NOT_ELEGANT = /\b(jogg\w*|tuta|sweat\w*|cargo|fleece|pile|gomma|pioggia|rain|felpa|hoodie|sport\w*|running)\b/i

function fits(p: Product, gender: 'uomo' | 'donna') {
  if (NEVER.test(p.title)) return false
  if (gender === 'uomo') return !FOR_WOMEN.test(p.title) && !WOMEN_BRANDS.has((p.brand ?? '').toLowerCase())
  return !FOR_MEN.test(p.title)
}

export function outfitTotal(items: Product[]) {
  let total = 0
  for (const p of items) {
    const price = freshPrice(p)?.price
    if (price === undefined) return null
    total += price
  }
  return total
}

/** Tutti gli outfit di un genere, sempre gli stessi per lo stesso catalogo. */
export function buildOutfits(products: Product[], gender: 'uomo' | 'donna'): Outfit[] {
  const pool = new Map<CategoryId, Product[]>()
  const seenModel = new Set<string>()
  for (const p of products) {
    if (p.availability === 'out_of_stock' || !p.imageUrl || !freshPrice(p) || !mainColor(p)) continue
    if ((p.gender !== gender && p.gender !== 'unisex') || !fits(p, gender)) continue
    // Una variante per modello: niente stessa felpa in due colori.
    const key = modelKey(p)
    if (seenModel.has(key)) continue
    seenModel.add(key)
    pool.set(p.category, [...(pool.get(p.category) ?? []), p])
  }
  const uses = new Map<string, number>()
  const outfits: Outfit[] = []
  for (const recipe of RECIPES) {
    if (!recipe.genders.includes(gender)) continue
    const rand = rng(hash(`${recipe.style}:${gender}`))
    const pick = (cats: CategoryId[], colors: string[]) => {
      const strong = colors.filter((c) => !NEUTRAL.has(c)).length
      const candidates = cats.flatMap((c) => pool.get(c) ?? []).filter((p) => {
        if ((uses.get(p.id) ?? 0) >= MAX_USES) return false
        if (recipe.style !== 'casual' && NOT_ELEGANT.test(p.title)) return false
        const color = mainColor(p)!
        return NEUTRAL.has(color) || (strong === 0 && !colors.includes(color))
      })
      return candidates.length ? candidates[Math.floor(rand() * candidates.length)] : undefined
    }
    let made = 0
    for (let attempt = 0; attempt < MAX_PER_STYLE * 3 && made < MAX_PER_STYLE; attempt++) {
      const items: Product[] = []
      let ok = true
      for (const slot of recipe.slots) {
        if (slot.optional !== undefined && rand() > slot.optional) continue
        const p = pick(slot.cats, items.map((i) => mainColor(i)!))
        if (!p) {
          if (slot.optional === undefined) ok = false
          continue
        }
        items.push(p)
      }
      // Niente sandali con il cappotto.
      if (!ok || (items.some((i) => i.category === 'cappotti') && items.some((i) => i.category === 'sandali'))) continue
      for (const i of items) uses.set(i.id, (uses.get(i.id) ?? 0) + 1)
      outfits.push({ id: outfitId(items.map((i) => i.id)), gender, style: recipe.style, items })
      made++
    }
  }
  // Stili mescolati, sempre nello stesso ordine.
  const rand = rng(hash(gender))
  return outfits.map((o) => [rand(), o] as const).sort((a, b) => a[0] - b[0]).map(([, o]) => o)
}
