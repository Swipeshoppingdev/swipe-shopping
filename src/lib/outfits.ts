import type { CategoryId } from '../config/categories'
import { freshPrice } from './price.ts'
import { modelKey } from './dedupe.ts'
import { isNew } from './newness.ts'
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

export type OutfitStyle = 'casual' | 'smart' | 'elegante' | 'ufficio' | 'nero' | 'vestito' | 'serata' | 'weekend' | 'sportivo'
export const STYLE_LABEL: Record<OutfitStyle, string> = {
  casual: 'Casual',
  smart: 'Smart casual',
  elegante: 'Elegante',
  ufficio: 'Da ufficio',
  nero: 'Total black',
  vestito: 'Con il vestito',
  serata: 'Da sera',
  weekend: 'Weekend',
  sportivo: 'Sportivo',
}

/** fit: per categorie miste (nello "sportivo" ci sono anche top e reggiseni) solo i capi giusti per quel posto */
type Slot = { cats: CategoryId[]; optional?: number; fit?: (p: Product) => boolean }
const isBlack = (p: Product) => mainColor(p) === 'Nero'

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
        { cats: ['cinture', 'orologi', 'borse', 'gioielli'], optional: 0.6 },
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
      // Per uscire la sera: vestito, scarpe eleganti, borsa e un gioiello.
      style: 'serata',
      genders: ['donna'],
      slots: [
        { cats: ['vestiti'] },
        { cats: cold ? ['scarpe_eleganti', 'stivali'] : ['scarpe_eleganti', 'sandali'] },
        { cats: ['borse'] },
        { cats: ['gioielli', 'orologi'] },
        ...(cold ? [{ cats: ['cappotti'], optional: 0.5 } satisfies Slot] : []),
      ],
    },
    {
      // Fuori porta: capospalla sempre, scarpe comode, zaino o cappellino.
      style: 'weekend',
      genders: ['uomo', 'donna'],
      slots: [
        { cats: cold ? ['maglioni', 'felpe'] : ['tshirt', 'camicie'] },
        { cats: ['jeans', 'pantaloni'] },
        { cats: cold ? ['stivali', 'sneakers'] : ['sneakers', 'scarpe_sportive'] },
        { cats: cold ? ['giacche', 'cappotti'] : ['giacche'] },
        { cats: ['zaini', 'cappellini', 'occhiali'], optional: 0.7 },
      ],
    },
    {
      // A metà tra casual ed elegante: camicia o maglione con i jeans, scarpe curate.
      style: 'smart',
      genders: ['uomo', 'donna'],
      slots: [
        { cats: cold ? ['camicie', 'maglioni'] : ['camicie'] },
        { cats: ['jeans', 'pantaloni'] },
        { cats: cold ? ['stivali', 'scarpe_eleganti', 'sneakers'] : ['scarpe_eleganti', 'sneakers'] },
        { cats: cold ? ['cappotti', 'giacche'] : ['giacche'], optional: cold ? 0.7 : 0.2 },
        { cats: ['cinture', 'orologi', 'gioielli', 'occhiali'], optional: 0.6 },
      ],
    },
    {
      // In ufficio: camicia e pantaloni, scarpe eleganti, giacca o cappotto, borsa o orologio.
      style: 'ufficio',
      genders: ['uomo', 'donna'],
      slots: [
        { cats: ['camicie'] },
        { cats: ['pantaloni'] },
        { cats: ['scarpe_eleganti'] },
        { cats: cold ? ['cappotti', 'giacche'] : ['giacche'], optional: cold ? 0.8 : 0.4 },
        { cats: ['borse', 'orologi', 'cinture'], optional: 0.8 },
      ],
    },
    {
      // Tutto nero, dalla testa ai piedi.
      style: 'nero',
      genders: ['uomo', 'donna'],
      slots: [
        { cats: cold ? ['maglioni', 'felpe', 'camicie'] : ['tshirt', 'camicie'], fit: isBlack },
        { cats: ['jeans', 'pantaloni'], fit: isBlack },
        { cats: cold ? ['stivali', 'sneakers'] : ['sneakers', 'scarpe_eleganti'], fit: isBlack },
        { cats: cold ? ['giacche', 'cappotti'] : ['giacche'], optional: cold ? 0.8 : 0.3, fit: isBlack },
        { cats: ['occhiali', 'cappellini', 'borse', 'cinture'], optional: 0.6, fit: isBlack },
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
const MAX_USES = 10
const MAX_PER_STYLE = 1200
const BATCH = 50
/** Quanti capi a caso si provano per un posto prima di arrendersi */
const TRIES = 40

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
const NEVER = /\b(calze|calzini|socks|shorts?|bermuda|pantaloncin\w*|costum\w*|pigiama|bambin\w*|kids?|junior|neonat\w*)\b/i
/** Fuori stagione */
const SUMMER_ONLY = /\b(lino|linen|canott\w*|smanicat\w*|sandal\w*|infradito|ciabatt\w*)\b/i
const WINTER_ONLY = /\b(lana|wool|piumin\w*|imbottit\w*|teddy|cashmere|montone|dolcevita)\b/i
/** Stili curati: niente capi sportivi o da tempo libero */
const DRESSY = new Set<OutfitStyle>(['smart', 'elegante', 'ufficio', 'vestito', 'serata'])
/** Non stanno in un outfit elegante */
const NOT_ELEGANT = /\b(zain\w*|lavoro|workwear|salopett\w*|jogg\w*|tuta|sweat\w*|cargo|fleece|pile|gomma|pioggia|rain|felpa|hoodie|sport\w*|running)\b/i

/** Capi finiti nella categoria sbagliata (una maglietta tra i jeans): il titolo nomina un capo di sopra. */
const TOP_WORDS = /\b(t-?shirts?|top|maglia|maglion\w*|felpa|camici\w*|body|polo)\b/i
const BOTTOMS = new Set<CategoryId>(['jeans', 'pantaloni'])

function fits(p: Product, gender: 'uomo' | 'donna') {
  if (NEVER.test(p.title)) return false
  if (BOTTOMS.has(p.category) && TOP_WORDS.test(p.title)) return false
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

/** I capi che possono entrare negli outfit di un genere, divisi per categoria. */
function outfitPool(products: Product[], gender: 'uomo' | 'donna', cold: boolean) {
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
    const list = pool.get(p.category)
    if (list) list.push(p)
    else pool.set(p.category, [p])
  }
  return pool
}

/** Il colore di un capo va con gli altri: neutro, oppure l'unico colore acceso dell'outfit. */
function colorFits(p: Product, others: Product[]) {
  const color = mainColor(p)
  if (!color) return false
  const colors = others.map((o) => mainColor(o)!)
  return NEUTRAL.has(color) || (!colors.some((c) => !NEUTRAL.has(c)) && !colors.includes(color))
}

/**
 * "Cambia un capo": altri capi della stessa categoria che stanno bene con il resto dell'outfit
 * (stessi controlli di quando l'outfit è stato composto), in un ordine fisso per quel capo.
 */
export function swapOptions(outfit: Outfit, index: number, products: Product[], month = new Date().getMonth()): Product[] {
  const item = outfit.items[index]
  const others = outfit.items.filter((_, i) => i !== index)
  const recipe = recipes(isColdSeason(month)).find((r) => r.style === outfit.style)
  const slot = recipe?.slots.find((s) => s.cats.includes(item.category))
  const elegant = DRESSY.has(outfit.style)
  const taken = new Set(outfit.items.map(modelKey))
  const list = (outfitPool(products, outfit.gender, isColdSeason(month)).get(item.category) ?? []).filter(
    (p) => !taken.has(modelKey(p)) && (!slot?.fit || slot.fit(p)) && !(elegant && NOT_ELEGANT.test(p.title)) && colorFits(p, others),
  )
  const rand = rng(hash(item.id))
  return list.map((p) => [rand(), p] as const).sort((a, b) => a[0] - b[0]).map(([, p]) => p)
}

/**
 * Tutti gli outfit di un genere, sempre gli stessi per lo stesso catalogo e la stessa stagione.
 * Solo capi Amazon: le foto degli altri negozi sono quasi sempre indossate, e nel collage stonano.
 */
export function buildOutfits(products: Product[], gender: 'uomo' | 'donna', month = new Date().getMonth()): Outfit[] {
  const cold = isColdSeason(month)
  const pool = outfitPool(products, gender, cold)
  const uses = new Map<string, number>()
  const ids = new Set<string>()
  const outfits: Outfit[] = []
  // Tutti gli stili a turno, a blocchi: così uno stile non consuma da solo i capi (es. i pantaloni) che servono agli altri.
  const makers = recipes(cold)
    .filter((recipe) => recipe.genders.includes(gender))
    .map((recipe) => {
      const rand = rng(hash(`${recipe.style}:${gender}`))
      const elegant = DRESSY.has(recipe.style)
      // I capi adatti a ogni posto si calcolano una volta; poi se ne provano alcuni a caso (veloce anche con migliaia di capi).
      const slotPool = recipe.slots.map((slot) =>
        slot.cats.flatMap((c) => pool.get(c) ?? []).filter((p) => (!slot.fit || slot.fit(p)) && !(elegant && NOT_ELEGANT.test(p.title))),
      )
      const pick = (i: number, colors: string[]) => {
        const list = slotPool[i]
        if (!list.length) return undefined
        const strong = colors.some((c) => !NEUTRAL.has(c))
        for (let t = 0; t < TRIES && list.length; t++) {
          const k = Math.floor(rand() * list.length)
          const p = list[k]
          if ((uses.get(p.id) ?? 0) >= MAX_USES) {
            // Esaurito: fuori dalla lista, così non si riprova.
            list[k] = list[list.length - 1]
            list.pop()
            continue
          }
          const color = mainColor(p)!
          if (NEUTRAL.has(color) || (!strong && !colors.includes(color))) return p
        }
        return undefined
      }
      let made = 0
      let attempt = 0
      // Tanti tentativi falliti di fila: i capi per questo stile sono finiti.
      let fails = 0
      return (upTo: number) => {
        for (; attempt < MAX_PER_STYLE * 3 && made < upTo && fails < 100; attempt++) {
          fails++
          const items: Product[] = []
          let ok = true
          for (const [n, slot] of recipe.slots.entries()) {
            if (slot.optional !== undefined && rand() > slot.optional) continue
            const p = pick(n, items.map((i) => mainColor(i)!))
            if (!p) {
              if (slot.optional === undefined) ok = false
              continue
            }
            items.push(p)
          }
          // Niente sandali con il cappotto.
          if (!ok || (items.some((i) => i.category === 'cappotti') && items.some((i) => i.category === 'sandali'))) continue
          const id = outfitId(items.map((i) => i.id))
          if (ids.has(id)) continue
          ids.add(id)
          for (const i of items) uses.set(i.id, (uses.get(i.id) ?? 0) + 1)
          outfits.push({ id, gender, style: recipe.style, items })
          made++
          fails = 0
        }
      }
    })
  for (let upTo = BATCH; upTo <= MAX_PER_STYLE; upTo += BATCH) for (const make of makers) make(upTo)
  // Stili mescolati, sempre nello stesso ordine; prima quelli con capi appena arrivati.
  const rand = rng(hash(gender))
  const mixed = outfits.map((o) => [rand(), o] as const).sort((a, b) => a[0] - b[0]).map(([, o]) => o)
  const fresh = (o: Outfit) => o.items.some((i) => isNew(i))
  return [...mixed.filter(fresh), ...mixed.filter((o) => !fresh(o))]
}
