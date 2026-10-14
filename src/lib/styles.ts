import type { Product } from '../types/product'

/**
 * Stili della Moda per il filtro "Stile" (idea di una tester): si capiscono dal titolo e, per alcune marche
 * molto riconoscibili, dalla marca. Un capo può avere più stili; senza indizi è "Casual".
 */
export const STYLES = [
  { id: 'casual', label: 'Casual' },
  { id: 'elegante', label: 'Elegante' },
  { id: 'streetwear', label: 'Streetwear' },
  { id: 'sportivo', label: 'Sportivo' },
  { id: 'romantico', label: 'Boho e romantico' },
  { id: 'rock', label: 'Rock' },
] as const

export type StyleId = (typeof STYLES)[number]['id']

const WORDS: [StyleId, RegExp][] = [
  [
    'elegante',
    /\b(elegant\w*|blazer|cerimonia|tailleur|raso|satin|seta|chiffon|smoking|tacc(?:o|hi)|d[eé]collet\w*|mocassin\w*|oxford|derby|brogue|stringat\w*|pochette|cravatt\w*|da sera|cocktail|cashmere|merino|cappotto)\b/i,
  ],
  [
    'streetwear',
    /\b(oversize\w*|baggy|cargo|graphic|street\w*|skate\w*|hip.?hop|bomber|varsity|college|jogger\w*|trucker|snapback|high.?top|chunky|platform|cappuccio|hoodie)\b/i,
  ],
  ['sportivo', /\b(running|training|fitness|palestra|yoga|tuta|dry.?fit|traspirant\w*|trail|calcio|tennis|ciclismo|sportiv\w*)\b/i],
  ['romantico', /\b(florea\w*|fiori|fiorat\w*|pizzo|volant\w*|ruches|boho|plissettat\w*|smock\w*|balz\w*|romantic\w*|paisley|etnic\w*|lino)\b/i],
  ['rock', /\b(borchi\w*|biker|anfibi\w*|combat|teschi\w*|skull|catene|grunge|punk|rock)\b/i],
]

/** La pelle è rock su giacche e pantaloni, non su borse, cinture e scarpe eleganti. */
const LEATHER = /\b(pelle|similpelle|ecopelle|leather)\b/i
const LEATHER_ROCK = new Set(['giacche', 'pantaloni', 'gonne'])

const BRANDS: Record<string, StyleId> = {
  carhartt: 'streetwear',
  dickies: 'streetwear',
  'urban classics': 'streetwear',
  'karl kani': 'streetwear',
  ellesse: 'streetwear',
  vans: 'streetwear',
  'new era': 'streetwear',
  jordan: 'streetwear',
  obey: 'streetwear',
  'tommy jeans': 'streetwear',
  converse: 'streetwear',
  desigual: 'romantico',
  'dr. martens': 'rock',
  hackett: 'elegante',
}

const SPORT_CATEGORIES = new Set(['sportivo', 'scarpe_sportive'])
const ELEGANT_CATEGORIES = new Set(['scarpe_eleganti', 'cravatte'])

const cache = new WeakMap<Product, StyleId[]>()

export function stylesOf(p: Product): StyleId[] {
  let out = cache.get(p)
  if (out) return out
  const found = new Set<StyleId>()
  for (const [id, re] of WORDS) if (re.test(p.title)) found.add(id)
  if (LEATHER_ROCK.has(p.category) && LEATHER.test(p.title)) found.add('rock')
  const brand = p.brand ? BRANDS[p.brand.toLowerCase()] : undefined
  if (brand) found.add(brand)
  if (SPORT_CATEGORIES.has(p.category)) found.add('sportivo')
  if (ELEGANT_CATEGORIES.has(p.category)) found.add('elegante')
  out = found.size ? [...found] : ['casual']
  cache.set(p, out)
  return out
}
