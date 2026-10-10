import type { CategoryId } from '../config/categories'
import { freshPrice } from './price'
import { modelKey } from './dedupe'
import { isNew } from './newness'
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

export type OutfitStyle = 'casual' | 'elegante' | 'vestito' | 'sportivo'
export const STYLE_LABEL: Record<OutfitStyle, string> = { casual: 'Casual', elegante: 'Elegante', vestito: 'Con il vestito', sportivo: 'Sportivo' }

/** fit: per categorie miste (nello "sportivo" ci sono anche top e reggiseni) solo i capi giusti per quel posto */
type Slot = { cats: CategoryId[]; optional?: number; fit?: (p: Product) => boolean }

/** Pantaloni da tuta o leggings (non la tuta intera, che ha già la felpa) */
const sportBottom = (p: Product) =>
  /\b(jogger\w*|leggings?)\b/i.test(p.title) || (/\bpantalon\w*/i.test(p.title) && (p.category === 'sportivo' || /\b(tuta|sport\w*)\b/i.test(p.title)))
type Recipe = { style: OutfitStyle; genders: ('uomo' | 'donna')[]; slots: Slot[] }

/** Freddo da ottobre ad aprile: cappotti, stivali e maglioni; d'estate niente capi pesanti. */
export const isColdSeason = (month: number) => month >= 9 || month <= 3

function recipes(cold: boolean): Recipe[] {
  return [
    {
      style: 'casual',
      genders: ['uomo', 'donna'],
      slots: [
        { cats: cold ? ['felpe', 'maglioni', 'camicie', 'tshirt'] : ['tshirt', 'camicie'] },
        { cats: ['jeans', 'pantaloni'] },
        { cats: cold ? ['sneakers', 'stivali'] : ['sneakers'] },
        { cats: ['giacche'], optional: cold ? 0.8 : 0.15 },
        { cats: ['cappellini', 'zaini', 'orologi', 'occhiali'], optional: 0.5 },
      ],
    },
    {
      style: 'elegante',
      genders: ['uomo', 'donna'],
      slots: [
        { cats: cold ? ['camicie', 'maglioni'] : ['camicie'] },
        { cats: ['pantaloni'] },
        { cats: cold ? ['scarpe_eleganti', 'stivali'] : ['scarpe_eleganti'] },
        ...(cold ? [{ cats: ['cappotti'], optional: 0.7 } satisfies Slot] : []),
        { cats: ['cinture', 'orologi', 'borse'], optional: 0.6 },
      ],
    },
    {
      style: 'vestito',
      genders: ['donna'],
      slots: [
        { cats: ['vestiti'] },
        { cats: cold ? ['stivali', 'scarpe_eleganti', 'sneakers'] : ['sandali', 'scarpe_eleganti', 'sneakers'] },
        { cats: ['borse'] },
        { cats: cold ? ['giacche', 'cappotti'] : ['giacche'], optional: cold ? 0.7 : 0.2 },
      ],
    },
    {
      style: 'sportivo',
      genders: ['uomo', 'donna'],
      slots: [
        { cats: cold ? ['felpe'] : ['tshirt', 'felpe'] },
        { cats: ['sportivo', 'pantaloni'], fit: sportBottom },
        { cats: ['scarpe_sportive', 'sneakers'] },
        { cats: ['zaini', 'cappellini', 'orologi'], optional: 0.6 },
      ],
    },
  ]
}

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
/** Fuori stagione */
const SUMMER_ONLY = /\b(lino|linen|canott\w*|smanicat\w*|sandal\w*|infradito|ciabatt\w*)\b/i
const WINTER_ONLY = /\b(lana|wool|piumin\w*|imbottit\w*|teddy|cashmere|montone|dolcevita)\b/i
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

/**
 * Tutti gli outfit di un genere, sempre gli stessi per lo stesso catalogo e la stessa stagione.
 * Solo capi Amazon: le foto degli altri negozi sono quasi sempre indossate, e nel collage stonano.
 */
export function buildOutfits(products: Product[], gender: 'uomo' | 'donna', month = new Date().getMonth()): Outfit[] {
  const cold = isColdSeason(month)
  const offSeason = cold ? SUMMER_ONLY : WINTER_ONLY
  const pool = new Map<CategoryId, Product[]>()
  const seenModel = new Set<string>()
  for (const p of products) {
    if (p.store !== 'amazon' || p.availability === 'out_of_stock' || !p.imageUrl || !freshPrice(p) || !mainColor(p)) continue
    if (offSeason.test(p.title)) continue
    if ((p.gender !== gender && p.gender !== 'unisex') || !fits(p, gender)) continue
    // Una variante per modello: niente stessa felpa in due colori.
    const key = modelKey(p)
    if (seenModel.has(key)) continue
    seenModel.add(key)
    pool.set(p.category, [...(pool.get(p.category) ?? []), p])
  }
  const uses = new Map<string, number>()
  const outfits: Outfit[] = []
  for (const recipe of recipes(cold)) {
    if (!recipe.genders.includes(gender)) continue
    const rand = rng(hash(`${recipe.style}:${gender}`))
    const pick = (slot: Slot, colors: string[]) => {
      const strong = colors.filter((c) => !NEUTRAL.has(c)).length
      const candidates = slot.cats.flatMap((c) => pool.get(c) ?? []).filter((p) => {
        if ((uses.get(p.id) ?? 0) >= MAX_USES) return false
        if (slot.fit && !slot.fit(p)) return false
        if (recipe.style !== 'casual' && recipe.style !== 'sportivo' && NOT_ELEGANT.test(p.title)) return false
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
        const p = pick(slot, items.map((i) => mainColor(i)!))
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
  // Stili mescolati, sempre nello stesso ordine; prima quelli con capi appena arrivati.
  const rand = rng(hash(gender))
  const mixed = outfits.map((o) => [rand(), o] as const).sort((a, b) => a[0] - b[0]).map(([, o]) => o)
  const fresh = (o: Outfit) => o.items.some((i) => isNew(i))
  return [...mixed.filter(fresh), ...mixed.filter((o) => !fresh(o))]
}
