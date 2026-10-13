import { universeOf, type CategoryId } from '../src/config/categories.ts'

// Corregge la categoria in base al titolo: la ricerca Amazon per "scarpe eleganti" a volte
// restituisce sneakers, quella per "giacca" una felpa, ecc. Si cambia solo dentro lo stesso gruppo
// (scarpe con scarpe, abbigliamento con abbigliamento) e solo se il titolo è chiaro.

type Rule = [category: string, pattern: RegExp]

const SHOES: Rule[] = [
  ['scarpe_sportive', /\b(running|corsa|trail|jogging|scarpe da (?:corsa|running))\b/i],
  ['sandali', /\b(sandal\w*|ciabatt\w*|infradito|zoccol\w*|slides?|flip.?flop)\b/i],
  ['stivali', /\b(stival\w*|anfibi\w*|boots?|chelsea|chukka)\b/i],
  ['sneakers', /\b(sneakers?|scarpe da ginnastica|trainers?|basket)\b/i],
  ['scarpe_eleganti', /\b(oxford|derby|mocassin\w*|brogue|stringat\w*|decollet\w*|scarpe eleganti)\b/i],
]

const CLOTHES: Rule[] = [
  ['cappotti', /\b(cappott\w*|parka|trench)\b/i],
  ['giacche', /\b(giacc\w*|giubbott\w*|piumin\w*|jacket|bomber|gilet)\b/i],
  ['vestiti', /\b(vestit\w*|abito|dress)\b/i],
  ['jeans', /\bjeans\b/i],
  ['felpe', /\b(felp\w*|hoodie|sweatshirt)\b/i],
  ['tshirt', /\b(t-?shirt|maglietta|tee)\b/i],
  ['maglioni', /\b(maglion\w*|pullover|cardigan|knit)\b/i],
  ['camicie', /\b(camici\w*)\b/i],
  ['pantaloni', /\b(pantalon\w*|chino|jogger|cargo)\b/i],
]

const GROUPS: Rule[][] = [SHOES, CLOTHES]

// Tech: auricolari finiti tra le cuffie (e viceversa), cuffie e visori da gioco tra gli accessori gaming.
// Solo dentro queste categorie: su uno smartphone "Pixel 11 + Pixel Buds" non deve diventare auricolari.
const TECH_MOVABLE = ['cuffie', 'auricolari', 'videogiochi', 'accessori_gaming']
const TECH_RULES: Rule[] = [
  ['cuffie', /\b(?:over[- ]?ear|on[- ]?ear|sovraurali|airpods max|WH-[A-Z0-9]+)\b/i],
  [
    'auricolari',
    /^(?!.*\b(?:over[- ]?ear|on[- ]?ear|sovraurali|major|monitor|headphones)\b).*\b(?:auricolar[ei]|earbuds?|buds|in-ear|true wireless|open-ear|powerbeats|fit pro)\b/i,
  ],
  ['accessori_gaming', /\b(?:playstation (?:vr|camera)|inzone|quantum \d+x?)\b|\b(?:cuffie|cuffia) (?:gaming|da gaming|da gioco)\b|\bgaming wireless\b/i],
]

export function classify(title: string, category: string): string {
  if (TECH_MOVABLE.includes(category)) {
    const own = TECH_RULES.find(([c]) => c === category)?.[1]
    if (own?.test(title)) return category
    return TECH_RULES.find(([, re]) => re.test(title))?.[0] ?? category
  }
  const rules = GROUPS.find((g) => g.some(([c]) => c === category))
  if (!rules) return category
  const own = rules.find(([c]) => c === category)?.[1]
  if (own?.test(title)) return category // il titolo conferma la categoria attuale
  const match = rules.find(([, re]) => re.test(title))
  return match ? match[0] : category
}

// Articoli da scartare in una categoria: accessori al posto del prodotto (cover, cinturini, cavi…),
// punti di gioco, pezzi per PC, dopobarba tra i profumi. Le parole "accessorio" contano solo a inizio
// titolo o seguite da "per": "Apple Watch con Cinturino Sport" o "con custodia di ricarica" restano.
const ACC = '(?:cover|custodia|custodie|pellicola|vetro temperato|protezione schermo|screen protector|case|caricatore|caricabatterie|cavo|alimentatore|adattatore|supporto|cinturino|cinturini|strap|bracciale)'
// Niente "+" prima: "Pixel 10a + Cover per Pixel 10a" è il telefono con la cover in regalo.
const ACC_FOR = new RegExp(`^[^+]*\\b${ACC}\\s+(?:per|for|compatibile|compatible)\\b`, 'i')
const startsWith = (words: string, n = 2) => new RegExp(`^(?:\\S+\\s+){0,${n}}(?:${words})\\b`, 'i')

const JUNK: Record<string, RegExp[]> = {
  smartphone: [startsWith('cover|custodia|pellicola|vetro|protezione|cavo|caricatore|caricabatterie|alimentatore|power ?bank|supporto|batteria', 1), ACC_FOR],
  tablet: [
    startsWith('keyboard|tastiera|cover|custodia|pellicola|penna|pencil|stylus|caricatore|cavo'),
    /\b(?:cover|custodia|pellicola|vetro temperato|keyboard|tastiera)\s+(?:pack\s+)?(?:per|for|compatibile)\b/i,
  ],
  smartwatch: [startsWith('cinturino|cinturini|strap|band|bracciale|cover|custodia|pellicola|vetro|caricatore|caricabatterie|cavo|base di ricarica'), ACC_FOR],
  cuffie: [startsWith('cuscinetti|earpads?|custodia|cover|cavo|adattatore|supporto'), /\b(?:cuscinetti|earpads|gommini)\s+(?:per|for|di ricambio|ricambio)\b/i],
  auricolari: [startsWith('gommini|eartips?|custodia|cover|cavo|caricatore'), /\b(?:gommini|eartips|cover|custodia)\s+(?:per|for|compatibil)/i],
  casse: [startsWith('custodia|cover|borsa|supporto|staffa|cavo|caricatore|alimentatore'), /\b(?:custodia|cover|borsa|supporto|staffa)\s+(?:per|for|compatibil)/i],
  console: [startsWith('custodia|cover|pellicola|caricatore|cavo|base|dock|controller|joy-?con|volante|borsa|skin|adattatore', 1)],
  fotocamere: [
    startsWith('impugnatura|custodia|borsa|batteri[ae]|caricabatteri[ae]?|treppiede|cavalletto|filtr[oi]|obiettivo|scheda|cinghia|tracolla', 1),
    /\bstabilizzatore\b|\bmicrofono\b|\bDJI Mic\b/i,
  ],
  videogiochi: [/\b(?:fc points|punti fc|v-?bucks|gift ?card|carta regalo|abbonamento)\b/i],
  accessori_gaming: [/\b(?:ram|ddr[345]|alimentatore|psu|ssd|scheda (?:video|madre)|processore|dissipatore|ventola)\b/i],
  ereader: [startsWith('cover|custodia|pellicola|vetro|caricatore|cavo|supporto|luce'), ACC_FOR, startsWith('sleep ?cover', 2)],
  droni: [
    startsWith('eliche|batteri[ae]|custodia|borsa|zaino|caricatore|caricabatteri[ae]?|filtr[oi]|paraeliche|pellicola', 1),
    ACC_FOR,
    // Visori e radiocomandi venduti da soli ("Drone con telecomando" resta: la parola deve stare all'inizio).
    startsWith('goggles|visore|radiocomand\\w*|radiocommande|telecomando|rc plus|rc pro', 3),
  ],
  monitor: [startsWith('supporto|braccio|staffa|cavo|pellicola|filtro|lampada|adattatore', 4), ACC_FOR],
  tastiere_mouse: [startsWith('cavo|ricevitore|copritastiera|keycaps?|cover|custodia', 1), ACC_FOR, startsWith('tappetino|mouse ?pad|poggiapolsi', 5)],
  profumi: [
    /after ?shave|dopobarba|\bimpacto\b/i,
    /^(?!.*\b(?:eau de|edp|edt|parfum|profumo|cologne|colonia|fragranza)\b).*\b(?:balsamo|balm|deodorante|deodorant|gel doccia|shower gel|bagnoschiuma|crema|body lotion|lozione)\b/i,
    // Mini da pochi ml vendute da sole (prezzo al ml assurdo); i cofanetti con "+" restano.
    /^[^+]*\b[1-7](?:[.,]\d)?\s?ml\b[^+]*$/i,
  ],
}

// Moda è per adulti: capi e scarpe da bambino finiscono nelle ricerche (taglie "12 Years", "Unisex-Bambini", "Jnr").
const KIDS =
  /\b(?:bambin[oaie]|bimb[oaie]|neonat[oaie]|kids|junior|jnr|toddler|teen|boys|girl[’']s)\b|\b(?:da|per) ragazz[oaie]\b|\b\d{1,2}(?:-\d{1,2})?\s*(?:anni|years|mesi|months)\b/i

/** true se il titolo non è il prodotto della categoria (accessorio, ricarica, ricambio, capo da bambino…). */
export const isJunk = (title: string, category: string) =>
  (JUNK[category] ?? []).some((re) => re.test(title)) || (universeOf(category as CategoryId) === 'moda' && KIDS.test(title))
