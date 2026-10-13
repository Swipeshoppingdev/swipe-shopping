import { AnimatePresence, motion } from 'framer-motion'
import { Heart, Play, RefreshCw, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { ProductImage } from '../components/ProductImage'
import { ADMIN_EMAIL } from '../config/app'
import { categoryLabel, universeOf, type CategoryId } from '../config/categories'
import { STYLE_LABEL, buildOutfits, outfitTotal, type Outfit } from '../lib/outfits'
import { formatPrice, freshPrice } from '../lib/price'
import { colorSwatch } from '../config/colors'
import { routeHref } from '../lib/useHashRoute'
import { useApp } from '../state/AppState'
import { useAuth } from '../state/AuthState'
import type { Product } from '../types/product'

/**
 * Studio (#/studio), solo per il titolare: video verticali per Instagram e TikTok, da registrare con la
 * registrazione schermo dell'iPhone. I contenuti cambiano ogni giorno; "Altri" ne propone di nuovi.
 * Le foto dei prodotti si mostrano come nell'app (mai modificate o unite).
 */
type Format = 'offerte' | 'sfida' | 'outfit' | 'swipe' | 'meme' | 'prezzo' | 'sconto' | 'marche' | 'caro' | 'budget' | 'sotto' | 'regali' | 'colore' | 'vetrina' | 'mood' | 'pioggia' | 'stop' | 'mese' | 'tieni'
const FORMATS: { id: Format; label: string }[] = [
  { id: 'offerte', label: 'Top 5 offerte' },
  { id: 'sfida', label: 'Questo o quello' },
  { id: 'outfit', label: 'Outfit sotto 100 €' },
  { id: 'swipe', label: 'Swipe in diretta' },
  { id: 'meme', label: 'Meme' },
  { id: 'prezzo', label: 'Indovina il prezzo' },
  { id: 'sconto', label: 'Prima e dopo' },
  { id: 'marche', label: 'Marche più amate' },
  { id: 'caro', label: 'Quale costa di più?' },
  { id: 'budget', label: 'Cosa compri con…' },
  { id: 'sotto', label: 'Top 5 sotto…' },
  { id: 'regali', label: 'Idee regalo' },
  { id: 'colore', label: 'Total colore' },
  { id: 'vetrina', label: '✨ Vetrina 3D' },
  { id: 'mood', label: '✨ Moodboard' },
  { id: 'pioggia', label: '✨ Pioggia di offerte' },
  { id: 'stop', label: '😂 Ferma il video' },
  { id: 'mese', label: '😂 Il tuo mese' },
  { id: 'tieni', label: '😂 Tienine uno' },
]
/** Formati con uomo/donna (gli outfit) */
const WITH_GENDER: Format[] = ['sfida', 'outfit', 'budget', 'regali', 'colore', 'vetrina', 'mood', 'stop', 'mese', 'tieni']

/**
 * Meme in tre stili, tutti con layout nostri (nessun template coperto da diritti):
 * - classico: scritta sopra e sotto la foto, bianca con il bordo nero;
 * - pov: barra bianca in alto con il testo nero, come i video di TikTok;
 * - scelta: due righe "no" / "sì" con le faccine, il prodotto è la scelta giusta.
 * {marca}, {sconto} e {prezzo} si riempiono con il prodotto; le frasi con {sconto} vanno solo con prodotti scontati.
 * moda: la frase parla di vestiti, quindi si usa un prodotto della sezione Moda.
 */
type MemeStyle = 'classico' | 'pov' | 'scelta'
interface MemeLine {
  style: MemeStyle
  top: string
  bottom: string
  moda?: boolean
}
const MEME_STYLES: { id: MemeStyle | 'tutti'; label: string }[] = [
  { id: 'tutti', label: 'Tutti' },
  { id: 'classico', label: 'Classico' },
  { id: 'pov', label: 'POV' },
  { id: 'scelta', label: 'No / Sì' },
]
const c = (top: string, bottom: string, moda?: boolean): MemeLine => ({ style: 'classico', top, bottom, moda })
const pov = (top: string, bottom: string, moda?: boolean): MemeLine => ({ style: 'pov', top, bottom, moda })
const sc = (top: string, bottom: string, moda?: boolean): MemeLine => ({ style: 'scelta', top, bottom, moda })
const MEMES: MemeLine[] = [
  c('Io: quest\'anno risparmio', 'Anche io alle 2 di notte:'),
  c('Il mio conto in banca:', 'Io che vedo questo a {prezzo}:'),
  c('Nessuno:', 'Io che scorro offerte invece di dormire'),
  c('"Guardo e basta"', 'Il carrello 5 minuti dopo:'),
  c('Quando dici "è un investimento"', 'ma è {marca} a {prezzo}'),
  c('Mia madre: hai già troppe cose', 'Io: ma era scontato del {sconto}'),
  c('Lunedì mattina', 'ma almeno con questo addosso', true),
  c('Il mio stipendio dopo 3 giorni:', 'Io che apro comunque Swipe Shopping:'),
  c('Swipe a destra', 'più veloce che su Tinder'),
  c('Io che dico "solo una cosa"', 'Le 7 cose nel carrello:'),
  c('Quando il pacco arriva', 'e non ti ricordi di averlo ordinato'),
  c('-{sconto} su {marca}', 'e tu ancora non l\'hai preso?'),
  c('Ragazzi è solo {prezzo}', 'praticamente me lo stanno regalando'),
  c('Il mio armadio: pieno', 'Io: non ho niente da mettermi', true),
  c('Quando l\'amica ti chiede dove l\'hai preso', 'e tu fai finta di non ricordare', true),
  c('Io prima del caffè', 'Io dopo aver visto questo a {prezzo}'),
  c('Questa è la mia personalità ora', '{marca}'),
  c('Il mio budget: 0 €', 'Il mio cuore: {prezzo}'),
  c('Mandalo a chi te lo deve regalare', '👇'),
  c('Domenica sera', 'shopping dal divano'),
  c('Io: devo smettere di comprare', 'Sempre io: aggiungo ai preferiti'),
  c('Quando dici "lo prendo la prossima volta"', 'e poi finisce lo sconto'),
  c('Primo appuntamento?', 'Outfit: questo', true),
  c('Tagga chi lo comprerebbe', 'senza pensarci due volte'),
  c('Natale è vicino', 'e io ho già la lista pronta'),
  c('Il corriere quando vede il mio indirizzo', 'di nuovo tu?'),
  c('Io che controllo il conto', 'Io che chiudo l\'app della banca e apro Swipe Shopping'),
  c('Quando lo sconto è del {sconto}', 'e il tuo autocontrollo dello 0%'),
  c('Non mi serve', 'ma lo voglio'),
  c('Mi vesto in 5 minuti', 'dopo 2 ore a scegliere', true),
  c('Io a gennaio: basta spese', 'Io a gennaio, il 3:'),
  pov('POV: hai trovato il -{sconto} su {marca}', 'e non lo dici a nessuno 🤫'),
  pov('POV: sono le 2 di notte e fai swipe sulle offerte', '"solo un altro" 😅'),
  pov('POV: la tua amica ti chiede dove l\'hai preso', 'swipeshopping.app 💅', true),
  pov('POV: è arrivato lo stipendio', 'e il carrello era già pronto 🛒'),
  pov('POV: hai detto "guardo e basta"', 'eppure… 👀'),
  pov('POV: {marca} a {prezzo}', 'e tu che pensavi costasse il doppio 😳'),
  pov('POV: devi uscire tra 10 minuti', 'e hai trovato l\'outfit giusto 🔥', true),
  pov('POV: tua madre ti chiede cosa vuoi per Natale', 'e tu hai già il link pronto 🎁'),
  pov('POV: scorri i saldi in pausa pranzo', 'e il pranzo si raffredda 🍝'),
  pov('POV: hai fatto swipe a destra', 'ed è stato amore a prima vista 😍'),
  pov('POV: il pacco arriva oggi', 'e non riesci a lavorare 📦'),
  pov('POV: -{sconto} e nessuno lo sa ancora', 'corri prima che finisca ⏳'),
  sc('Pagarlo a prezzo pieno', 'Prenderlo scontato del {sconto}'),
  sc('Girare 3 negozi il sabato', 'Fare swipe dal divano'),
  sc('Chiedere consiglio al gruppo', 'Fare swipe e decidere in 2 secondi'),
  sc('Comprare la prima cosa che vedi', '{marca} a {prezzo}'),
  sc('Dire "non ho niente da mettermi"', 'Trovare questo', true),
  sc('Aspettare il Black Friday', 'Il -{sconto} di oggi'),
  sc('Regalo all\'ultimo minuto', 'Lista dei preferiti pronta'),
  sc('Il solito outfit', 'Questo', true),
  sc('Spendere tutto in un negozio', 'Lo stesso stile a {prezzo}'),
  sc('Scorrere per ore senza trovare niente', 'Swipe Shopping'),
]
const OUTFIT_BUDGET = 100

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const today = () => Math.floor(Date.now() / 86_400_000)
function pick<T>(list: T[], n: number, rand: () => number) {
  const copy = [...list]
  const out: T[] = []
  while (copy.length && out.length < n) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0])
  return out
}

/** Un fotogramma del video: cosa mostrare e per quanti millisecondi */
interface Slide {
  ms: number
  node: ReactNode
  /** Sfondo a tutto schermo per questo fotogramma (i formati "belli"): sostituisce il gradiente scuro */
  bg?: string
}
/** I fotogrammi e la didascalia pronta per il post */
type Slides = Slide[] & { caption?: string }
const withCaption = (caption: string, slides: Slide[]): Slides => Object.assign(slides, { caption })

const TAGS = '#swipeshopping #shoppingonline #moda #offerte #outfit'
/** In fondo a ogni post: dove trovare l'app e la dicitura obbligatoria per i link di affiliazione. */
const FOOTER = `👉 Link in bio: swipeshopping.app\n\n#pubblicità ${TAGS}`

/** Calendario: un formato per giorno della settimana (0 = domenica), più le storie ogni giorno. */
const WEEK: Format[] = ['marche', 'offerte', 'sfida', 'prezzo', 'outfit', 'meme', 'sconto']
/** Il secondo post del giorno (chi vuole pubblicare di più). */
const WEEK2: Format[] = ['mese', 'stop', 'vetrina', 'tieni', 'mood', 'stop', 'pioggia']
/** Colori più comuni nei titoli Amazon, per "Total colore" */
const LOOK_COLORS = ['Nero', 'Bianco', 'Beige', 'Blu', 'Grigio', 'Marrone', 'Verde', 'Rosso', 'Rosa']
const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']

export function StudioPage() {
  const auth = useAuth()
  if (!auth.ready) return null
  if (auth.user?.email?.toLowerCase() !== ADMIN_EMAIL) {
    return <p className="py-16 text-center text-sm text-[#737373]">Questa pagina è riservata.</p>
  }
  return <Studio />
}

function Studio() {
  const { allProducts } = useApp()
  const [format, setFormat] = useState<Format>(() => WEEK[new Date().getDay()])
  // Comandi nascosti per guardare l'anteprima intera: si riaprono toccando il palco.
  const [panel, setPanel] = useState(true)
  const [gender, setGender] = useState<'donna' | 'uomo'>('donna')
  const [variant, setVariant] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [step, setStep] = useState(0)
  // Meme: testo scritto a mano (solo il titolare usa lo Studio); vuoto = frase pronta.
  const [memeTop, setMemeTop] = useState('')
  const [memeBottom, setMemeBottom] = useState('')
  const [memeStyle, setMemeStyle] = useState<MemeStyle | 'tutti'>('tutti')
  // "Altra frase" e "Altro prodotto" cambiano solo una delle due cose.
  const [memeLine, setMemeLine] = useState(0)
  const [memeProduct, setMemeProduct] = useState(0)
  const brands = useWeeklyBrands(format === 'marche')

  const moda = useMemo(() => allProducts.filter((p) => universeOf(p.category) === 'moda'), [allProducts])
  const outfits = useMemo(() => buildOutfits(moda, gender), [moda, gender])

  const slides = useMemo<Slides>(() => {
    const rand = rng(today() * 1000 + variant * 7 + (gender === 'uomo' ? 1 : 0) + format.length)
    if (format === 'offerte') {
      const deals = allProducts
        .filter((p) => p.availability !== 'out_of_stock' && p.imageUrl && (freshPrice(p)?.discountPct ?? 0) >= 20)
        .sort((a, b) => freshPrice(b)!.discountPct! - freshPrice(a)!.discountPct!)
        .slice(0, 80)
      // Cinque offerte di categorie diverse, dalla più piccola alla più grande: la migliore per ultima.
      const chosen: Product[] = []
      for (const p of pick(deals, deals.length, rand)) {
        if (chosen.length < 5 && !chosen.some((c) => c.category === p.category)) chosen.push(p)
      }
      chosen.sort((a, b) => freshPrice(a)!.discountPct! - freshPrice(b)!.discountPct!)
      const best = chosen.at(-1)
      const cap = `Le 5 offerte più pazze di oggi 🔥${best ? ` La numero 1? ${best.brand} a -${freshPrice(best)!.discountPct}%` : ''}\n\nQuale prendi? Scrivilo nei commenti 👇 I prezzi cambiano ogni giorno, corri!\n\n${FOOTER} #sconti #affari`
      return withCaption(cap, [
        { ms: 2200, node: <Title kicker="Le migliori di oggi" title="TOP 5 OFFERTE" sub="Prezzi verificati oggi" /> },
        ...chosen.map((p, i) => ({ ms: 3200, node: <DealSlide product={p} rank={chosen.length - i} /> })),
        { ms: 3000, node: <Outro line="Tutte le offerte su" /> },
      ])
    }
    if (format === 'outfit') {
      const cheap = outfits.filter((o) => {
        const t = outfitTotal(o.items)
        return t !== null && t <= OUTFIT_BUDGET && o.items.length >= 4
      })
      const o = pick(cheap.length ? cheap : outfits, 1, rand)[0]
      if (!o) return []
      const sum = outfitTotal(o.items)
      const cap = `Outfit ${STYLE_LABEL[o.style].toLowerCase()} da ${o.gender} completo${sum !== null ? ` a ${formatPrice(sum)}` : ''} 👀 ${[...new Set(o.items.map((i) => i.brand).filter(Boolean))].slice(0, 4).join(', ')}.\n\nLo indosseresti? Sì o no nei commenti 👇 Salvalo per dopo!\n\n${FOOTER} #outfitdelgiorno #ootd #lookdelgiorno`
      return withCaption(cap, [
        { ms: 2000, node: <Title kicker={`Outfit ${STYLE_LABEL[o.style].toLowerCase()}`} title={`SOTTO ${OUTFIT_BUDGET} €`} sub={`Look completo da ${o.gender}`} /> },
        ...o.items.map((_, i) => ({ ms: 1300, node: <OutfitBuild outfit={o} shown={i + 1} /> })),
        { ms: 3200, node: <OutfitBuild outfit={o} shown={o.items.length} total /> },
        { ms: 3000, node: <Outro line="Altri outfit su" /> },
      ])
    }
    if (format === 'sfida') {
      const ok = outfits.filter((o) => outfitTotal(o.items) !== null && o.items.length >= 3 && o.items.length <= 4)
      const [a] = pick(ok, 1, rand)
      const b = a && pick(ok.filter((o) => o.style === a.style && o.id !== a.id), 1, rand)[0]
      if (!a || !b) return []
      const cap = `Questo o quello? Outfit ${STYLE_LABEL[a.style].toLowerCase()} da ${a.gender} 🤔\n\nA o B? Scrivilo nei commenti e tagga chi sceglierebbe l'altro 👇\n\n${FOOTER} #questoquello #ootd #stile`
      return withCaption(cap, [
        { ms: 1800, node: <Title kicker={`Outfit ${STYLE_LABEL[a.style].toLowerCase()}`} title="QUESTO O QUELLO?" sub="Scegli prima di scorrere" /> },
        { ms: 7000, node: <Versus a={a} b={b} /> },
        { ms: 3000, node: <Outro line="Scrivi A o B nei commenti 👇" /> },
      ])
    }
    const inStock = (p: Product) => p.availability !== 'out_of_stock' && !!p.imageUrl && !!freshPrice(p)
    const discounted = (min: number) => allProducts.filter((p) => inStock(p) && (freshPrice(p)!.discountPct ?? 0) >= min)
    if (format === 'meme') {
      const lineRand = rng(today() * 1000 + variant * 7 + memeLine * 13 + 5)
      const productRand = rng(today() * 1000 + variant * 7 + memeProduct * 17 + 9)
      // Prima la frase, poi un prodotto adatto: scontato, della Moda se la frase parla di vestiti.
      const lines = MEMES.filter((m) => memeStyle === 'tutti' || m.style === memeStyle)
      const line = pick(lines, 1, lineRand)[0]
      const needsDeal = `${line.top}${line.bottom}`.includes('{sconto}')
      const pool = discounted(needsDeal ? 15 : 10).filter((p) => !line.moda || universeOf(p.category) === 'moda')
      const [p] = pick(pool, 1, productRand)
      if (!p) return []
      const fp = freshPrice(p)!
      const fill = (t: string) =>
        t.replaceAll('{marca}', p.brand ?? 'questo').replaceAll('{sconto}', `${fp.discountPct ?? 0}%`).replaceAll('{prezzo}', formatPrice(fp.price))
      const top = memeTop || fill(line.top)
      const bottom = memeBottom || fill(line.bottom)
      const hook = line.style === 'scelta' ? 'Team 🙅 o team 😍? Scrivilo nei commenti 👇' : 'Chi si rivede qui? 😂 Tagga l\'amica/o che lo farebbe 👇'
      const cap = `${hook}\n\n${p.brand ?? ''} a ${formatPrice(fp.price)}${fp.discountPct ? ` (-${fp.discountPct}%)` : ''}, oggi.\n\n${FOOTER} #meme #memeitaliani #shoppingaddict`
      return withCaption(cap, [
        { ms: 6500, node: <Meme product={p} style={line.style} top={top} bottom={bottom} /> },
        { ms: 3000, node: <Outro line="Lo trovi su" /> },
      ])
    }
    if (format === 'prezzo') {
      const items = pick(
        allProducts.filter((p) => inStock(p) && freshPrice(p)!.price >= 25 && !freshPrice(p)!.from),
        3,
        rand,
      )
      const cap = `Indovina il prezzo! 💸 3 prodotti, ferma il video e scrivi la tua risposta prima del via.\n\nQuanti ne hai indovinati? 0, 1, 2 o 3? Commenta 👇\n\n${FOOTER} #indovinailprezzo #challenge #gioco`
      return withCaption(cap, [
        { ms: 2000, node: <Title kicker="Gioco" title="INDOVINA IL PREZZO" sub="Scrivi la tua risposta prima del via" /> },
        ...items.flatMap((p, i) => [
          ...[3, 2, 1].map((n) => ({ ms: 900, node: <Guess product={p} index={i + 1} count={n} /> })),
          { ms: 2800, node: <Guess product={p} index={i + 1} /> },
        ]),
        { ms: 3000, node: <Outro line="Quanti ne hai indovinati? Scrivilo nei commenti 👇 Gioca su" /> },
      ])
    }
    if (format === 'sconto') {
      const items = pick(discounted(30), 3, rand)
      const cap = `Prima e dopo lo sconto 😱 ${items.map((p) => `${p.brand}: -${freshPrice(p)!.discountPct}%`).join(' · ')}\n\nQuale ti ha sorpreso di più? 👇 Prezzi di oggi, possono cambiare.\n\n${FOOTER} #sconti #primaedopo #affari`
      return withCaption(cap, [
        { ms: 1800, node: <Title kicker="Prima e dopo" title="LO SCONTO" sub="Prezzo pieno contro prezzo di oggi" /> },
        ...items.flatMap((p) => [
          { ms: 1600, node: <BeforeAfter product={p} /> },
          { ms: 2800, node: <BeforeAfter product={p} after /> },
        ]),
        { ms: 3000, node: <Outro line="Altre offerte su" /> },
      ])
    }
    if (format === 'marche') {
      if (!brands?.length) return []
      const top = brands.slice(0, 5)
      const cap = `Le marche più amate della settimana su Swipe Shopping 🏆 1. ${top[0]?.id}${top[1] ? `, 2. ${top[1].id}` : ''}${top[2] ? `, 3. ${top[2].id}` : ''}. Classifica fatta con i Sì veri di chi usa l'app.\n\nLa tua preferita è in classifica? 👇\n\n${FOOTER} #classifica #brand #topbrand`
      return withCaption(cap, [
        { ms: 2200, node: <Title kicker="Classifica della settimana" title="LE MARCHE PIÙ AMATE" sub="Dai Sì veri di chi usa l'app" /> },
        ...[...top].reverse().map((b, i) => {
          const photo = pick(
            allProducts.filter((p) => inStock(p) && p.brand?.toLowerCase() === b.id.toLowerCase()),
            1,
            rand,
          )[0]
          return { ms: 2600, node: <BrandRank rank={top.length - i} brand={b.id} likePct={b.like} product={photo} /> }
        }),
        { ms: 3000, node: <Outro line="Vota anche tu su" /> },
      ])
    }
    if (format === 'caro') {
      // Tre coppie della stessa categoria (e genere), prezzi lontani almeno il 25%: si indovina, poi si scopre.
      const pool = pick(allProducts.filter((p) => inStock(p) && !freshPrice(p)!.from), 400, rand)
      const pairs: [Product, Product][] = []
      for (const a of pool) {
        if (pairs.length >= 3) break
        if (pairs.some(([x, y]) => x.category === a.category || y.category === a.category)) continue
        const b = pool.find(
          (q) => q !== a && q.category === a.category && q.gender === a.gender && q.brand !== a.brand && Math.max(freshPrice(q)!.price, freshPrice(a)!.price) >= 1.25 * Math.min(freshPrice(q)!.price, freshPrice(a)!.price),
        )
        if (b) pairs.push([a, b])
      }
      if (pairs.length < 3) return []
      const cap = `Quale costa di più? 🤔 3 sfide, ferma il video e scegli prima del via.\n\nQuante ne hai indovinate? Scrivilo nei commenti 👇 Prezzi di oggi.\n\n${FOOTER} #qualecostadipiu #challenge #gioco`
      return withCaption(cap, [
        { ms: 2000, node: <Title kicker="Gioco" title="QUALE COSTA DI PIÙ?" sub="Scegli prima del via" /> },
        ...pairs.flatMap(([a, b], i) => [
          ...[3, 2, 1].map((n) => ({ ms: 900, node: <WhichPricier a={a} b={b} index={i + 1} count={n} /> })),
          { ms: 3000, node: <WhichPricier a={a} b={b} index={i + 1} /> },
        ]),
        { ms: 3000, node: <Outro line="Quante ne hai indovinate? 👇 Gioca su" /> },
      ])
    }
    // Moda del genere scelto (e unisex)
    const forGender = (p: Product) => p.gender === gender || p.gender === 'unisex'
    if (format === 'budget') {
      // Con un budget fisso: capi di categorie diverse finché il totale ci sta.
      const budget = [30, 50, 100][Math.floor(rand() * 3)]
      const chosen: Product[] = []
      let sum = 0
      for (const p of pick(moda.filter((p) => inStock(p) && forGender(p) && !freshPrice(p)!.from && freshPrice(p)!.price <= budget * 0.6), 600, rand)) {
        const price = freshPrice(p)!.price
        if (chosen.length < 5 && sum + price <= budget && !chosen.some((c) => c.category === p.category)) {
          chosen.push(p)
          sum += price
        }
      }
      if (chosen.length < 3) return []
      const cap = `Cosa compri con ${budget} € da ${gender}? 💸 ${chosen.length} pezzi a ${formatPrice(sum)} in tutto: ${[...new Set(chosen.map((p) => p.brand).filter(Boolean))].join(', ')}.\n\nTu cosa avresti preso? 👇 Salvalo per dopo!\n\n${FOOTER} #budget #risparmio #haul`
      return withCaption(cap, [
        { ms: 2000, node: <Title kicker={`Look da ${gender}`} title={`COSA COMPRI CON ${budget} €?`} sub="Prezzi veri di oggi" /> },
        ...chosen.map((_, i) => ({ ms: 1800, node: <BudgetList items={chosen} shown={i + 1} budget={budget} /> })),
        { ms: 3200, node: <BudgetList items={chosen} shown={chosen.length} budget={budget} done /> },
        { ms: 3000, node: <Outro line="Trovi tutto su" /> },
      ])
    }
    if (format === 'sotto') {
      // Una categoria di qualsiasi sezione con abbastanza prodotti sotto la soglia: 5 di marche diverse.
      const groups = new Map<string, Product[]>()
      const limit = [15, 20, 30, 50][Math.floor(rand() * 4)]
      for (const p of allProducts) {
        if (!inStock(p) || freshPrice(p)!.price > limit) continue
        const list = groups.get(p.category) ?? []
        list.push(p)
        groups.set(p.category, list)
      }
      const ok = [...groups].filter(([, list]) => new Set(list.map((p) => p.brand)).size >= 5)
      const [entry] = pick(ok, 1, rand)
      if (!entry) return []
      const [cat, list] = entry
      const chosen: Product[] = []
      for (const p of pick(list, list.length, rand)) if (chosen.length < 5 && !chosen.some((c) => c.brand === p.brand)) chosen.push(p)
      chosen.sort((a, b) => freshPrice(b)!.price - freshPrice(a)!.price)
      const name = categoryLabel(cat as CategoryId)
      const cap = `5 ${name.toLowerCase()} sotto ${limit} € 🔥 ${chosen.map((p) => p.brand).filter(Boolean).join(', ')}.\n\nQuale prendi? Scrivi il numero nei commenti 👇 Prezzi di oggi, possono cambiare.\n\n${FOOTER} #sotto${limit}euro #affari #consigli`
      return withCaption(cap, [
        { ms: 2200, node: <Title kicker={name} title={`TOP 5 SOTTO ${limit} €`} sub="Marche vere, prezzi di oggi" /> },
        ...chosen.map((p, i) => ({ ms: 3000, node: <DealSlide product={p} rank={chosen.length - i} /> })),
        { ms: 3000, node: <Outro line="Altri su" /> },
      ])
    }
    if (format === 'regali') {
      // Per lei: Moda e Beauty; per lui: Moda, Tech e Gadget. Categorie diverse, sotto la soglia.
      const sections = gender === 'donna' ? ['moda', 'beauty', 'casa'] : ['moda', 'tech', 'gadget']
      const limit = [30, 50][Math.floor(rand() * 2)]
      const chosen: Product[] = []
      for (const p of pick(allProducts.filter((p) => inStock(p) && forGender(p) && sections.includes(universeOf(p.category)) && freshPrice(p)!.price <= limit && freshPrice(p)!.price >= 10), 500, rand)) {
        if (chosen.length < 5 && !chosen.some((c) => c.category === p.category || c.brand === p.brand)) chosen.push(p)
      }
      if (chosen.length < 5) return []
      const who = gender === 'donna' ? 'lei' : 'lui'
      const month = new Date().getMonth()
      const kicker = month === 10 ? 'Black Friday' : month === 11 ? 'Natale' : 'Idee regalo'
      const cap = `5 idee regalo per ${who} sotto ${limit} € 🎁 ${chosen.map((p) => p.brand).filter(Boolean).join(', ')}.\n\nMandalo a chi te lo deve regalare 😏👇\n\n${FOOTER} #ideeregalo #regali #regaliperlui #regaliperlei`
      return withCaption(cap, [
        { ms: 2200, node: <Title kicker={kicker} title={`REGALI PER ${who.toUpperCase()}`} sub={`5 idee sotto ${limit} €`} /> },
        ...chosen.map((p, i) => ({ ms: 3000, node: <DealSlide product={p} rank={chosen.length - i} /> })),
        { ms: 3000, node: <Outro line="Tante altre idee regalo su" /> },
      ])
    }
    if (format === 'colore') {
      // Quattro capi dello stesso colore (letto dal titolo), categorie diverse: il "total look".
      const colors = pick(LOOK_COLORS, LOOK_COLORS.length, rand)
      for (const color of colors) {
        const chosen: Product[] = []
        for (const p of pick(moda.filter((p) => inStock(p) && forGender(p) && p.colors?.includes(color)), 600, rand)) {
          if (chosen.length < 4 && !chosen.some((c) => c.category === p.category)) chosen.push(p)
        }
        if (chosen.length < 4) continue
        const sum = chosen.reduce((t, p) => t + freshPrice(p)!.price, 0)
        const cap = `Total ${color.toLowerCase()} da ${gender} 🖤 4 pezzi a ${formatPrice(sum)}: ${[...new Set(chosen.map((p) => p.brand).filter(Boolean))].join(', ')}.\n\nChe colore vuoi la prossima volta? Scrivilo nei commenti 👇\n\n${FOOTER} #total${color.toLowerCase()} #monocromo #ootd`
        return withCaption(cap, [
          { ms: 2000, node: <Title kicker={`Look da ${gender}`} title={`TOTAL ${color.toUpperCase()}`} sub="Un colore, quattro pezzi" /> },
          ...chosen.map((_, i) => ({ ms: 1300, node: <ColorLook items={chosen} shown={i + 1} /> })),
          { ms: 3200, node: <ColorLook items={chosen} shown={chosen.length} total={sum} /> },
          { ms: 3000, node: <Outro line="Crea il tuo look su" /> },
        ])
      }
      return []
    }
    if (format === 'stop') {
      // "Ferma il video": i prodotti scorrono velocissimi, quello su cui ti fermi è il tuo regalo. Si mette in pausa (o screenshot).
      const items = pick(moda.filter((p) => inStock(p) && forGender(p)), 24, rand)
      if (items.length < 24) return []
      const cap = `Ferma il video: quello che esce è il tuo regalo 🎁😂 Fai screenshot e scrivi nei commenti cosa ti è uscito 👇\n\nE tagga chi te lo deve comprare!\n\n${FOOTER} #fermailvideo #stopthevideo #challenge`
      return withCaption(cap, [
        { ms: 1800, node: <Title kicker="Gioco" title="FERMA IL VIDEO" sub="Quello che esce è il tuo regalo 🎁" /> },
        { ms: 8000, node: <StopReel items={items} /> },
        { ms: 3000, node: <Outro line="Cosa ti è uscito? Scrivilo 👇 Poi cercalo su" /> },
      ])
    }
    if (format === 'mese') {
      // "Il tuo mese di nascita è il tuo…": dodici capi, uno per mese. Tutti commentano il loro mese.
      const thing = rand() < 0.5 ? 'outfit' : 'regalo'
      const chosen: Product[] = []
      for (const p of pick(moda.filter((p) => inStock(p) && forGender(p)), 800, rand)) {
        if (chosen.length < 12 && chosen.filter((c) => c.category === p.category).length < 2 && !chosen.some((c) => c.brand === p.brand)) chosen.push(p)
      }
      if (chosen.length < 12) return []
      const cap = `Il tuo mese di nascita è il tuo ${thing} 😂 Di che mese sei? Ti piace quello che ti è uscito? 👇\n\nTagga chi è nato nel tuo stesso mese!\n\n${FOOTER} #mesedinascita #ilmiomese #challenge`
      return withCaption(cap, [
        { ms: 2000, node: <Title kicker="Gioco" title="IL TUO MESE DI NASCITA" sub={`è il tuo ${thing} 👀`} /> },
        ...[0, 1, 2].map((part) => ({ ms: 4200, node: <MonthGrid items={chosen} part={part} /> })),
        { ms: 3000, node: <Outro line="Di che mese sei? Scrivilo 👇 Trovi tutto su" /> },
      ])
    }
    if (format === 'tieni') {
      // "Tienine solo uno": quattro pezzi forti, ne puoi tenere uno. Ottimo per i commenti.
      const rounds: Product[][] = []
      const pool = pick(moda.filter((p) => inStock(p) && forGender(p) && freshPrice(p)!.price >= 30), 800, rand)
      for (let r = 0; r < 3; r++) {
        const used = new Set(rounds.flat().map((p) => p.id))
        const group: Product[] = []
        for (const p of pool) if (group.length < 4 && !used.has(p.id) && !group.some((g) => g.category === p.category || g.brand === p.brand)) group.push(p)
        if (group.length === 4) rounds.push(group)
      }
      if (rounds.length < 3) return []
      const cap = `Puoi tenerne solo UNO 😩 3 round, scegli in fretta: 1, 2, 3 o 4? Scrivi le tue 3 risposte nei commenti 👇\n\n${FOOTER} #tieneunosolo #sceltadifficile #challenge`
      return withCaption(cap, [
        { ms: 1800, node: <Title kicker="Scelta difficile" title="TIENINE SOLO UNO" sub="3 round, decidi in 5 secondi" /> },
        ...rounds.map((g, r) => ({ ms: 5600, node: <KeepOne items={g} round={r + 1} /> })),
        { ms: 3000, node: <Outro line="Scrivi le tue scelte 👇 Trovi tutto su" /> },
      ])
    }
    if (format === 'vetrina') {
      // Sei capi (genere scelto) di categorie diverse in una giostra 3D: uno alla volta viene davanti.
      const chosen: Product[] = []
      for (const p of pick(moda.filter((p) => inStock(p) && forGender(p)), 600, rand)) {
        if (chosen.length < 6 && !chosen.some((c) => c.category === p.category || c.brand === p.brand)) chosen.push(p)
      }
      if (chosen.length < 6) return []
      const cap = `La vetrina di oggi ✨ 6 pezzi da ${gender}: ${chosen.map((p) => p.brand).filter(Boolean).join(', ')}.\n\nQuale metteresti nel carrello? Scrivi il numero 1-6 👇\n\n${FOOTER} #vetrina #wishlist #ootd`
      return withCaption(cap, [
        { ms: 2000, node: <Title kicker={`Da ${gender}`} title="LA VETRINA DI OGGI" sub="Sei pezzi, scegline uno" />, bg: VETRINA_BG },
        { ms: chosen.length * CAROUSEL_MS + 600, node: <Carousel items={chosen} />, bg: VETRINA_BG },
        { ms: 3000, node: <Outro line="Scegli il tuo su" />, bg: VETRINA_BG },
      ])
    }
    if (format === 'mood') {
      // Moodboard: sei capi dello stesso colore che si posano come foto su un tavolo, sullo sfondo di quel colore.
      for (const color of pick(LOOK_COLORS, LOOK_COLORS.length, rand)) {
        const chosen: Product[] = []
        for (const p of pick(moda.filter((p) => inStock(p) && forGender(p) && p.colors?.includes(color)), 600, rand)) {
          if (chosen.length < 6 && !chosen.some((c) => c.category === p.category)) chosen.push(p)
        }
        if (chosen.length < 6) continue
        const from = Math.min(...chosen.map((p) => freshPrice(p)!.price))
        const bg = moodBg(color)
        const cap = `Mood ${color.toLowerCase()} 🤍 sei pezzi da ${gender}, da ${formatPrice(from)}: ${[...new Set(chosen.map((p) => p.brand).filter(Boolean))].join(', ')}.\n\nChe colore vuoi la prossima volta? 👇 Salvalo per ispirarti!\n\n${FOOTER} #moodboard #mood${color.toLowerCase()} #ispirazione`
        return withCaption(cap, [{ ms: 9500, node: <Moodboard items={chosen} color={color} from={from} />, bg }, { ms: 3000, node: <Outro line="Il tuo mood su" />, bg }])
      }
      return []
    }
    if (format === 'pioggia') {
      // Le offerte "piovono" una sull'altra in un mucchio, poi la migliore viene davanti.
      const chosen: Product[] = []
      for (const p of pick(discounted(25), 300, rand)) if (chosen.length < 7 && !chosen.some((c) => c.category === p.category)) chosen.push(p)
      if (chosen.length < 5) return []
      const best = [...chosen].sort((a, b) => freshPrice(b)!.discountPct! - freshPrice(a)!.discountPct!)[0]
      const cap = `Piovono offerte ☔🔥 ${chosen.length} sconti di oggi, il migliore: ${best.brand} a -${freshPrice(best)!.discountPct}%.\n\nQuale prendi? 👇 Prezzi di oggi, possono cambiare.\n\n${FOOTER} #offerte #sconti #affari`
      return withCaption(cap, [
        { ms: chosen.length * RAIN_MS + 3800, node: <Rain items={chosen} best={best} /> },
        { ms: 3000, node: <Outro line="Tutte le offerte su" /> },
      ])
    }
    // Swipe in diretta: carte che vanno da sole a destra o a sinistra, come se qualcuno usasse l'app.
    const cards = pick(
      moda.filter((p) => p.availability !== 'out_of_stock' && p.imageUrl && freshPrice(p)),
      8,
      rand,
    )
    const cap = `Sì o no? 👀 Il modo più veloce per fare shopping: uno swipe e via. Quale avresti tenuto?\n\n${FOOTER} #swipe #shoppingtime #tendenze`
    return withCaption(cap, [
      // Un solo fotogramma per tutto il mazzo: le carte si susseguono senza dissolvenze in mezzo.
      { ms: cards.length * SWIPE_MS + 400, node: <SwipeReel cards={cards.map((p) => ({ product: p, yes: rand() > 0.4 }))} /> },
      { ms: 3000, node: <Outro line="Prova anche tu su" /> },
    ])
  }, [format, gender, variant, allProducts, moda, outfits, memeTop, memeBottom, memeStyle, memeLine, memeProduct, brands])

  // Riproduzione: un fotogramma dopo l'altro, poi si ferma sull'ultimo.
  useEffect(() => {
    if (!playing || step >= slides.length - 1) return
    const t = setTimeout(() => setStep((s) => s + 1), slides[step].ms)
    return () => clearTimeout(t)
  }, [playing, step, slides])

  const start = () => {
    setStep(0)
    setPlaying(true)
  }
  const stop = () => {
    setPlaying(false)
    setStep(0)
  }
  // Anteprima: il primo fotogramma "vero" (dopo il titolo), così si vede cosa uscirà.
  const previewAt: Partial<Record<Format, number>> = { swipe: 0, meme: 0, prezzo: 4, sconto: 2, caro: 4, budget: 1, colore: 5, vetrina: 1, mood: 0, pioggia: 0, stop: 1, mese: 1, tieni: 1 }
  const current = slides[playing ? step : Math.min(previewAt[format] ?? 1, slides.length - 1)]

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#000]">
      {/* Il palco: 9:16, grande quanto lo schermo del telefono */}
      <div
        className="relative h-full max-h-[calc(100vw*16/9)] w-full max-w-[calc(100dvh*9/16)] overflow-hidden bg-gradient-to-b from-[#1a0b14] via-[#14080f] to-[#000] text-[#fff]"
        onClick={() => (playing ? stop() : setPanel((v) => !v))}
      >
        {/* Luci di sfondo con gradienti radiali e non con blur: su iPhone il blur fa comparire riquadri scuri nelle registrazioni */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_5%,rgba(244,63,94,0.28),transparent_45%),radial-gradient(circle_at_90%_95%,rgba(99,102,241,0.28),transparent_45%)]" />
        <AnimatePresence>
          {current?.bg && (
            <motion.div key={current.bg} className="pointer-events-none absolute inset-0" style={{ background: current.bg }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }} />
          )}
        </AnimatePresence>
        <AnimatePresence mode="wait">
          <motion.div
            key={`${format}-${variant}-${playing ? step : 'preview'}`}
            // Zona sicura dei Reels/TikTok, valida per tutti i formati: margine a destra (icone) e sotto (nome e didascalia), contenuto centrato in altezza.
            className="absolute top-[15%] right-[12%] bottom-[18%] left-[9%] flex flex-col"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.35 }}
          >
            {current
              ? current.node
              : format === 'marche'
                ? <Title kicker="Studio" title="POCHI DATI" sub={brands === null ? 'Carico la classifica…' : 'Servono più Sì questa settimana per la classifica'} />
                : <Title kicker="Studio" title="POCHI DATI" sub="Il catalogo sta ancora caricando" />}
          </motion.div>
        </AnimatePresence>
        {playing && step < slides.length - 1 && (
          <div className="absolute inset-x-6 top-[max(1rem,env(safe-area-inset-top))] flex gap-1">
            {slides.map((_, i) => (
              <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-[#fff]/90' : 'bg-[#fff]/25'}`} />
            ))}
          </div>
        )}
      </div>

      {!playing && panel && (
        <div className="absolute inset-x-0 bottom-0 max-h-[70dvh] overflow-y-auto space-y-3 rounded-t-3xl border-t border-[#fff]/15 bg-[#0b0b0d] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(0,0,0,0.8)]">
          <div className="flex flex-wrap justify-center gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFormat(f.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${format === f.id ? 'bg-[#fff] text-[#111]' : 'bg-[#2a2a30] text-[#fff] ring-1 ring-[#fff]/20'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2">
            {WITH_GENDER.includes(format) && (
              <div className="flex rounded-full bg-[#2a2a30] p-1 text-sm font-semibold ring-1 ring-[#fff]/20">
                {(['donna', 'uomo'] as const).map((g) => (
                  <button key={g} type="button" onClick={() => setGender(g)} className={`rounded-full px-3 py-1 capitalize ${gender === g ? 'bg-[#fff] text-[#111]' : 'text-[#fff]'}`}>
                    {g}
                  </button>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setVariant((v) => v + 1)} className="inline-flex items-center gap-1.5 rounded-full bg-[#2a2a30] px-4 py-2 text-sm font-semibold text-[#fff] ring-1 ring-[#fff]/20">
              <RefreshCw className="size-4" /> Altri
            </button>
            <button type="button" onClick={start} disabled={!slides.length} className="inline-flex items-center gap-1.5 rounded-full bg-[#f43f5e] px-5 py-2 text-sm font-bold text-[#fff] disabled:opacity-40">
              <Play className="size-4 fill-current" /> Avvia
            </button>
            <a href={routeHref('profilo')} aria-label="Chiudi Studio" className="grid size-9 place-items-center rounded-full bg-[#2a2a30] text-[#fff] ring-1 ring-[#fff]/20">
              <X className="size-5" />
            </a>
          </div>
          <Calendar current={format} onPick={setFormat} />
          {slides.caption && <CaptionBox text={slides.caption} />}
          {format === 'meme' && (
            <div className="space-y-2">
              <div className="flex flex-wrap justify-center gap-2">
                {MEME_STYLES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMemeStyle(m.id)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${memeStyle === m.id ? 'bg-[#facc15] text-[#111]' : 'bg-[#2a2a30] text-[#fff] ring-1 ring-[#fff]/20'}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="flex justify-center gap-2">
                <button type="button" onClick={() => setMemeLine((v) => v + 1)} className="rounded-full bg-[#2a2a30] px-3 py-1.5 text-sm font-semibold text-[#fff] ring-1 ring-[#fff]/20">
                  Altra frase
                </button>
                <button type="button" onClick={() => setMemeProduct((v) => v + 1)} className="rounded-full bg-[#2a2a30] px-3 py-1.5 text-sm font-semibold text-[#fff] ring-1 ring-[#fff]/20">
                  Altro prodotto
                </button>
              </div>
              {(
                [
                  [memeTop, setMemeTop, 'Testo sopra (vuoto = frase pronta)'],
                  [memeBottom, setMemeBottom, 'Testo sotto (vuoto = frase pronta)'],
                ] as const
              ).map(([value, set, ph]) => (
                <input
                  key={ph}
                  value={value}
                  onChange={(e) => set(e.target.value.slice(0, 80))}
                  placeholder={ph}
                  className="w-full rounded-xl bg-[#2a2a30] px-3 py-2 text-sm text-[#fff] ring-1 ring-[#fff]/20 outline-none placeholder:text-[#fff]/50"
                />
              ))}
            </div>
          )}
          <p className="text-center text-xs text-[#fff]/75">
            Avvia la registrazione schermo, poi tocca Avvia. Tocca il video per fermarlo. Tocca l'anteprima per nascondere o mostrare i comandi.
          </p>
        </div>
      )}
    </div>
  )
}

function Title({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
      <p className="text-sm font-bold tracking-[0.3em] text-[#fb7185] uppercase">{kicker}</p>
      <h1 className="text-5xl leading-none font-black tracking-tight">{title}</h1>
      {sub && <p className="text-base text-[#fff]/70">{sub}</p>}
      <Logo className="mt-6 opacity-80" />
    </div>
  )
}

function Logo({ className = '' }: { className?: string }) {
  return (
    <p className={`text-2xl font-black tracking-tight ${className}`}>
      Swipe<span className="text-[#f43f5e]">Shopping</span>
    </p>
  )
}

function Outro({ line }: { line: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <img src="icons/icon-512.png" alt="" className="size-24 rounded-3xl shadow-2xl shadow-[#f43f5e]/30" />
      <p className="text-lg text-[#fff]/80">{line}</p>
      <Logo className="text-4xl" />
      <p className="rounded-full bg-[#fff] px-5 py-2 text-lg font-bold text-[#111]">swipeshopping.app</p>
      <p className="text-sm text-[#fff]/60">Link in bio · gratis, senza registrazione</p>
    </div>
  )
}

function Price({ product, big }: { product: Product; big?: boolean }) {
  const fp = freshPrice(product)
  if (!fp) return null
  return (
    <div className="flex items-baseline gap-3">
      <span className={`${big ? 'text-4xl' : 'text-xl'} font-black`}>
        {fp.from ? 'da ' : ''}
        {formatPrice(fp.price)}
      </span>
      {fp.originalPrice && <span className={`${big ? 'text-xl' : 'text-sm'} text-[#fff]/50 line-through`}>{formatPrice(fp.originalPrice)}</span>}
    </div>
  )
}

function DealSlide({ product, rank }: { product: Product; rank: number }) {
  const pct = freshPrice(product)?.discountPct
  return (
    <div className="flex flex-1 flex-col justify-center gap-5 px-7">
      <p className="text-6xl font-black text-[#fff]/15">#{rank}</p>
      <div className="relative">
        <ProductImage product={product} eager className="aspect-square w-full overflow-hidden rounded-3xl" />
        {pct && (
          <motion.span
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: -8 }}
            transition={{ delay: 0.4, type: 'spring', stiffness: 260, damping: 14 }}
            className="absolute -top-4 -right-3 rounded-2xl bg-[#f43f5e] px-4 py-2 text-3xl font-black shadow-xl"
          >
            -{pct}%
          </motion.span>
        )}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-bold tracking-widest text-[#fb7185] uppercase">{product.brand}</p>
        <p className="line-clamp-2 text-xl font-semibold">{product.title}</p>
        <Price product={product} big />
      </div>
    </div>
  )
}

function OutfitGrid({ outfit, shown = outfit.items.length }: { outfit: Outfit; shown?: number }) {
  const cols = outfit.items.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'
  return (
    <div className={`grid ${cols} gap-2`}>
      {outfit.items.map((p, i) => (
        <motion.div
          key={p.id}
          initial={false}
          animate={{ opacity: i < shown ? 1 : 0, scale: i < shown ? 1 : 0.85 }}
          transition={{ type: 'spring', stiffness: 220, damping: 20 }}
          className="relative"
        >
          <ProductImage product={p} eager className="aspect-square w-full overflow-hidden rounded-2xl" />
          {i < shown && freshPrice(p) && (
            <span className="absolute bottom-1.5 left-1.5 rounded-full bg-[#000]/80 px-2 py-0.5 text-xs font-bold">{formatPrice(freshPrice(p)!.price)}</span>
          )}
        </motion.div>
      ))}
    </div>
  )
}

function OutfitBuild({ outfit, shown, total }: { outfit: Outfit; shown: number; total?: boolean }) {
  const sum = outfitTotal(outfit.items)
  const last = outfit.items[shown - 1]
  return (
    <div className="flex flex-1 flex-col justify-center gap-5 px-6">
      <OutfitGrid outfit={outfit} shown={shown} />
      {total ? (
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
          <p className="text-sm font-bold tracking-[0.3em] text-[#fb7185] uppercase">Totale look</p>
          <p className="text-6xl font-black">{sum !== null ? formatPrice(sum) : ''}</p>
        </motion.div>
      ) : (
        last && (
          <div className="min-h-24 text-center">
            <p className="text-sm font-bold tracking-widest text-[#fb7185] uppercase">{last.brand}</p>
            <p className="line-clamp-2 text-lg font-semibold">{last.title}</p>
          </div>
        )
      )}
    </div>
  )
}

function Versus({ a, b }: { a: Outfit; b: Outfit }) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-3 px-4">
      {[a, b].map((o, i) => (
        <motion.div
          key={o.id}
          initial={{ x: i ? 80 : -80, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: i * 0.5, type: 'spring', stiffness: 160, damping: 18 }}
          className="relative rounded-3xl bg-[#fff]/5 p-2 ring-1 ring-[#fff]/10"
        >
          <span className={`absolute -top-3 z-10 grid size-12 place-items-center rounded-full text-2xl font-black shadow-xl ${i ? 'right-3 bg-[#6366f1]' : 'left-3 bg-[#f43f5e]'}`}>
            {i ? 'B' : 'A'}
          </span>
          <div className="grid grid-cols-4 gap-1.5">
            {o.items.slice(0, 4).map((p) => (
              <ProductImage key={p.id} product={p} eager className="aspect-square w-full overflow-hidden rounded-xl" />
            ))}
          </div>
          {outfitTotal(o.items) !== null && <p className="mt-1.5 text-center text-sm font-bold">Totale {formatPrice(outfitTotal(o.items)!)}</p>}
        </motion.div>
      ))}
      <p className="text-center text-2xl font-black">Quale scegli? 🤔</p>
    </div>
  )
}

const SWIPE_MS = 1700
const FLY = {
  out: (yes: boolean) => ({ x: yes ? 480 : -480, rotate: yes ? 22 : -22, zIndex: 10, transition: { duration: 0.45, ease: 'easeIn' as const } }),
}

/**
 * Swipe in diretta: un mazzo come nell'app. La carta resta ferma un attimo, si "preme" il bottone,
 * compare il timbro SÌ/NO e la carta vola via; sotto c'è già la successiva.
 */
function SwipeReel({ cards }: { cards: { product: Product; yes: boolean }[] }) {
  const [i, setI] = useState(0)
  // Fasi di ogni carta: 0 ferma, 1 bottone premuto + timbro, poi vola via (cambio di i).
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    if (i >= cards.length) return
    const press = setTimeout(() => setPhase(1), 750)
    const next = setTimeout(() => {
      setPhase(0)
      setI((n) => n + 1)
    }, SWIPE_MS)
    return () => {
      clearTimeout(press)
      clearTimeout(next)
    }
  }, [i, cards.length])
  const top = cards[i]
  const below = cards[i + 1]
  const yes = top?.yes ?? false
  return (
    <div className="flex flex-1 flex-col justify-center px-6">
      <div className="relative">
        {/* Tiene l'altezza del mazzo: le carte vere stanno sopra, una sull'altra */}
        <div aria-hidden className="invisible">
          <SwipeCardFace product={cards[0].product} />
        </div>
        {/* Carta sotto: stessa misura, appena più piccola, così il mazzo si vede */}
        {below && (
          <motion.div
            key={`b-${i + 1}`}
            initial={{ scale: 0.92, y: 14 }}
            animate={{ scale: phase ? 0.97 : 0.94, y: phase ? 6 : 10 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0"
          >
            <SwipeCardFace product={below.product} />
          </motion.div>
        )}
        <AnimatePresence initial={false}>
          {top && (
            <motion.div
              key={`t-${i}`}
              custom={top.yes}
              initial={{ scale: 0.97, y: 6 }}
              animate={{ scale: 1, y: 0, x: phase ? (top.yes ? 18 : -18) : 0, rotate: phase ? (top.yes ? 3 : -3) : 0 }}
              variants={FLY}
              exit="out"
              transition={{ duration: 0.25 }}
              className="absolute inset-0"
            >
              <SwipeCardFace product={top.product} />
              <motion.span
                initial={false}
                animate={{ opacity: phase ? 1 : 0, scale: phase ? 1 : 1.6 }}
                transition={{ duration: 0.2 }}
                className={`absolute top-6 rounded-xl border-4 bg-[#fff]/80 px-3 py-1 text-3xl font-black ${
                  top.yes ? 'left-6 -rotate-12 border-[#10b981] text-[#10b981]' : 'right-6 rotate-12 border-[#f43f5e] text-[#f43f5e]'
                }`}
              >
                {top.yes ? 'SÌ' : 'NO'}
              </motion.span>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
      <div className="mt-6 flex justify-center gap-6">
        <motion.span
          animate={{ scale: phase && !yes ? [1, 1.25, 1] : 1 }}
          transition={{ duration: 0.35 }}
          className={`grid size-16 place-items-center rounded-full text-3xl font-black ${phase && !yes ? 'bg-[#f43f5e] ring-4 ring-[#fff]' : 'bg-[#fff]/10'}`}
        >
          <X className="size-8" />
        </motion.span>
        <motion.span
          animate={{ scale: phase && yes ? [1, 1.25, 1] : 1 }}
          transition={{ duration: 0.35 }}
          className={`grid size-16 place-items-center rounded-full bg-[#f43f5e] ${phase && yes ? 'ring-4 ring-[#fff]' : ''}`}
        >
          <Heart className="size-8 fill-current" />
        </motion.span>
      </div>
    </div>
  )
}

function SwipeCardFace({ product }: { product: Product }) {
  return (
    <div className="overflow-hidden rounded-3xl bg-[#fff] text-[#111] shadow-2xl">
      <ProductImage product={product} eager className="aspect-square w-full" />
      <div className="space-y-0.5 p-4">
        <p className="text-[11px] font-semibold tracking-wide text-[#737373] uppercase">{product.brand}</p>
        <p className="line-clamp-1 font-semibold">{product.title}</p>
        {freshPrice(product) && <p className="text-lg font-black">{formatPrice(freshPrice(product)!.price)}</p>}
      </div>
    </div>
  )
}

/** Marche con la percentuale di Sì più alta negli ultimi 7 giorni (null mentre carica). */
function useWeeklyBrands(enabled: boolean) {
  const [brands, setBrands] = useState<{ id: string; like: number }[] | null>(null)
  useEffect(() => {
    if (!enabled || !supabase || brands) return
    supabase.rpc('admin_insights', { days: 7 }).then(({ data }) => {
      const rows = ((data as { brands?: { id: string; views: number; likes: number }[] } | null)?.brands ?? [])
      const min = rows.filter((r) => r.views >= 20).length >= 5 ? 20 : 8
      setBrands(
        rows
          .filter((r) => r.views >= min && r.likes > 0)
          .map((r) => ({ id: r.id, like: Math.round((r.likes / r.views) * 100) }))
          .sort((a, b) => b.like - a.like),
      )
    })
  }, [enabled, brands])
  return brands
}

// Scritta da meme: bianca, maiuscola, con il bordo nero vero (paint-order) e un'ombra di riserva.
const memeText =
  'text-center text-[2.1rem] leading-[1.05] font-black uppercase tracking-tight text-[#fff] [-webkit-text-stroke:7px_#000] [paint-order:stroke_fill] [text-shadow:0_4px_14px_rgba(0,0,0,.55)]'
const punch = { initial: { scale: 2.2, opacity: 0, rotate: -6 }, animate: { scale: 1, opacity: 1, rotate: 0 } }

function MemeCredit({ product }: { product: Product }) {
  return (
    <p className="text-center text-sm font-bold text-[#fff]/70">
      {product.brand} · swipeshopping.app
    </p>
  )
}

/** La frase sopra entra subito, la foto subito dopo, la battuta finale "esplode" dopo un attimo. */
function Meme({ product, style, top, bottom }: { product: Product; style: MemeStyle; top: string; bottom: string }) {
  if (style === 'pov') {
    return (
      <div className="flex flex-1 flex-col justify-center gap-4 px-5">
        <motion.p
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="rounded-2xl bg-[#fff] px-4 py-3 text-center text-[1.45rem] leading-tight font-extrabold text-[#111] shadow-2xl"
        >
          {top}
        </motion.p>
        <div className="relative">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.4 }}>
            <ProductImage product={product} eager className="aspect-square w-full overflow-hidden rounded-3xl" />
          </motion.div>
          {bottom && (
            <motion.p
              {...punch}
              transition={{ delay: 1.8, type: 'spring', stiffness: 260, damping: 14 }}
              className="absolute inset-x-3 -bottom-5 mx-auto w-fit max-w-full rotate-[-2deg] rounded-xl bg-[#facc15] px-4 py-2 text-center text-xl font-black text-[#111] shadow-xl"
            >
              {bottom}
            </motion.p>
          )}
        </div>
        <div className="mt-4">
          <MemeCredit product={product} />
        </div>
      </div>
    )
  }
  if (style === 'scelta') {
    return (
      <div className="flex flex-1 flex-col justify-center gap-3 px-5">
        <motion.div
          initial={{ x: -40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="flex items-center gap-3 rounded-3xl bg-[#2a1215] p-4 ring-2 ring-[#ef4444]/60"
        >
          <span className="text-6xl">🙅</span>
          <p className="flex-1 text-xl leading-tight font-extrabold text-[#fff]/85 line-through decoration-[#ef4444]/80 decoration-[3px]">{top}</p>
        </motion.div>
        <motion.div
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 1.6, type: 'spring', stiffness: 220, damping: 16 }}
          className="space-y-3 rounded-3xl bg-[#0f2a1a] p-4 ring-2 ring-[#22c55e]/70"
        >
          <div className="flex items-center gap-3">
            <span className="text-6xl">😍</span>
            <p className="flex-1 text-2xl leading-tight font-black text-[#fff]">{bottom}</p>
          </div>
          <ProductImage product={product} eager className="mx-auto aspect-square w-4/5 overflow-hidden rounded-2xl" />
        </motion.div>
        <MemeCredit product={product} />
      </div>
    )
  }
  return (
    <div className="flex flex-1 flex-col justify-center gap-5 px-6">
      <motion.p initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className={memeText}>
        {top}
      </motion.p>
      <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.3 }}>
        <ProductImage product={product} eager className="aspect-square w-full overflow-hidden rounded-3xl" />
      </motion.div>
      <motion.p {...punch} transition={{ delay: 1.8, type: 'spring', stiffness: 260, damping: 14 }} className={memeText}>
        {bottom}
      </motion.p>
      <MemeCredit product={product} />
    </div>
  )
}

function Guess({ product, index, count }: { product: Product; index: number; count?: number }) {
  const fp = freshPrice(product)!
  return (
    <div className="flex flex-1 flex-col justify-center gap-5 px-7">
      <p className="text-center text-sm font-bold tracking-[0.3em] text-[#fb7185] uppercase">Prodotto {index} di 3</p>
      <ProductImage product={product} eager className="aspect-square w-full overflow-hidden rounded-3xl" />
      <div className="space-y-1 text-center">
        <p className="text-sm font-bold tracking-widest text-[#fb7185] uppercase">{product.brand}</p>
        <p className="line-clamp-2 text-lg font-semibold">{product.title}</p>
      </div>
      <div className="flex h-20 items-center justify-center">
        {count ? (
          <motion.span key={count} initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-7xl font-black text-[#fff]">
            {count}
          </motion.span>
        ) : (
          <motion.span
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 14 }}
            className="rounded-2xl bg-[#f43f5e] px-6 py-2 text-5xl font-black"
          >
            {formatPrice(fp.price)}
          </motion.span>
        )}
      </div>
    </div>
  )
}

function BeforeAfter({ product, after }: { product: Product; after?: boolean }) {
  const fp = freshPrice(product)!
  return (
    <div className="flex flex-1 flex-col justify-center gap-6 px-7">
      <ProductImage product={product} eager className="aspect-square w-full overflow-hidden rounded-3xl" />
      <div className="space-y-1 text-center">
        <p className="text-sm font-bold tracking-widest text-[#fb7185] uppercase">{product.brand}</p>
        <p className="line-clamp-2 text-lg font-semibold">{product.title}</p>
      </div>
      <div className="relative flex h-28 flex-col items-center justify-center">
        <motion.span
          animate={after ? { y: -34, scale: 0.6, opacity: 0.55, rotate: [-3, 3, -2, 0] } : { y: 0, scale: 1, opacity: 1 }}
          transition={{ duration: 0.45 }}
          className={`text-5xl font-black ${after ? 'line-through decoration-[#f43f5e] decoration-4' : ''}`}
        >
          {formatPrice(fp.originalPrice ?? fp.price)}
        </motion.span>
        {after && (
          <motion.div
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.35, type: 'spring', stiffness: 260, damping: 13 }}
            className="absolute bottom-0 flex items-center gap-3"
          >
            <span className="text-6xl font-black text-[#fff]">{formatPrice(fp.price)}</span>
            <span className="rounded-xl bg-[#f43f5e] px-3 py-1 text-2xl font-black">-{fp.discountPct}%</span>
          </motion.div>
        )}
      </div>
    </div>
  )
}

function BrandRank({ rank, brand, likePct, product }: { rank: number; brand: string; likePct: number; product?: Product }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-7 text-center">
      <motion.p initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-8xl font-black text-[#f43f5e]">
        #{rank}
      </motion.p>
      <p className="text-5xl leading-none font-black">{brand}</p>
      <p className="text-lg text-[#fff]/80">
        <b className="text-[#fff]">{likePct}%</b> di Sì questa settimana
      </p>
      {product && <ProductImage product={product} eager className="aspect-square w-3/4 overflow-hidden rounded-3xl" />}
    </div>
  )
}

/** Due prodotti uno accanto all'altro: conto alla rovescia, poi i prezzi con la corona su quello più caro. */
function WhichPricier({ a, b, index, count }: { a: Product; b: Product; index: number; count?: number }) {
  const pa = freshPrice(a)!.price
  const pb = freshPrice(b)!.price
  return (
    <div className="flex flex-1 flex-col justify-center gap-5 px-5">
      <p className="text-center text-sm font-bold tracking-[0.3em] text-[#fb7185] uppercase">Sfida {index} di 3</p>
      <div className="grid grid-cols-2 gap-3">
        {[a, b].map((p, i) => {
          const dearer = (i === 0 ? pa > pb : pb > pa) && !count
          return (
            <div key={p.id} className={`relative rounded-3xl p-1.5 transition ${dearer ? 'bg-[#facc15]' : 'bg-[#fff]/10'}`}>
              {dearer && (
                <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: -12 }} className="absolute -top-6 -left-2 z-10 text-5xl">
                  👑
                </motion.span>
              )}
              <ProductImage product={p} eager className="aspect-square w-full overflow-hidden rounded-2xl" />
              <p className={`mt-1.5 truncate px-1 text-center text-xs font-bold tracking-wide uppercase ${dearer ? 'text-[#111]' : 'text-[#fb7185]'}`}>{p.brand}</p>
              <div className="flex h-12 items-center justify-center">
                {!count && (
                  <motion.span
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: i * 0.25, type: 'spring', stiffness: 260, damping: 14 }}
                    className={`text-2xl font-black whitespace-nowrap ${dearer ? 'text-[#111]' : 'text-[#fff]'}`}
                  >
                    {formatPrice(i === 0 ? pa : pb)}
                  </motion.span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex h-20 items-center justify-center">
        {count ? (
          <motion.span key={count} initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-7xl font-black">
            {count}
          </motion.span>
        ) : (
          <p className="text-2xl font-black">{pa > pb ? 'A sinistra' : 'A destra'} costa di più!</p>
        )}
      </div>
    </div>
  )
}

/** Lista che si riempie un pezzo alla volta, con la barra del budget. */
function BudgetList({ items, shown, budget, done }: { items: Product[]; shown: number; budget: number; done?: boolean }) {
  const sum = items.slice(0, shown).reduce((t, p) => t + freshPrice(p)!.price, 0)
  return (
    <div className="flex flex-1 flex-col justify-center gap-3 px-5">
      {items.slice(0, shown).map((p, i) => (
        <motion.div
          key={p.id}
          initial={i === shown - 1 && !done ? { x: 60, opacity: 0 } : false}
          animate={{ x: 0, opacity: 1 }}
          className="flex items-center gap-3 rounded-2xl bg-[#fff]/8 p-2 ring-1 ring-[#fff]/10"
        >
          <ProductImage product={p} eager className="size-20 shrink-0 overflow-hidden rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold tracking-widest text-[#fb7185] uppercase">{p.brand}</p>
            <p className="line-clamp-2 text-sm font-semibold">{p.title}</p>
          </div>
          <p className="text-lg font-black">{formatPrice(freshPrice(p)!.price)}</p>
        </motion.div>
      ))}
      <div className="mt-2">
        <div className="mb-1 flex justify-between text-sm font-bold">
          <span>Totale {formatPrice(sum)}</span>
          <span className="text-[#fff]/70">Budget {budget} €</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-[#fff]/15">
          <motion.div animate={{ width: `${Math.min(100, (sum / budget) * 100)}%` }} className="h-full rounded-full bg-[#22c55e]" />
        </div>
        {done && (
          <motion.p initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-3 text-center text-2xl font-black">
            Avanzano {formatPrice(budget - sum)} 🎉
          </motion.p>
        )}
      </div>
    </div>
  )
}

/** Griglia 2x2 dello stesso colore, un pezzo alla volta; alla fine il totale. */
function ColorLook({ items, shown, total }: { items: Product[]; shown: number; total?: number }) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-5 px-6">
      <div className="grid grid-cols-2 gap-2">
        {items.map((p, i) => (
          <motion.div key={p.id} initial={false} animate={{ opacity: i < shown ? 1 : 0, scale: i < shown ? 1 : 0.85 }} transition={{ type: 'spring', stiffness: 220, damping: 20 }} className="relative">
            <ProductImage product={p} eager className="aspect-square w-full overflow-hidden rounded-2xl" />
            {i < shown && <span className="absolute bottom-1.5 left-1.5 rounded-full bg-[#000]/80 px-2 py-0.5 text-xs font-bold">{formatPrice(freshPrice(p)!.price)}</span>}
          </motion.div>
        ))}
      </div>
      {total !== undefined ? (
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
          <p className="text-sm font-bold tracking-[0.3em] text-[#fb7185] uppercase">Totale look</p>
          <p className="text-6xl font-black">{formatPrice(total)}</p>
        </motion.div>
      ) : (
        <div className="min-h-24 text-center">
          <p className="text-sm font-bold tracking-widest text-[#fb7185] uppercase">{items[shown - 1]?.brand}</p>
          <p className="line-clamp-2 text-lg font-semibold">{items[shown - 1]?.title}</p>
        </div>
      )}
    </div>
  )
}

const VETRINA_BG = 'radial-gradient(120% 80% at 50% 30%, #3b2a4d 0%, #1b1027 55%, #07040b 100%)'
const CAROUSEL_MS = 2100
/** Sfondo del moodboard: il colore dei capi, sfumato e un po' più scuro in basso (testo sempre leggibile). */
function moodBg(color: string) {
  const sw = colorSwatch(color) ?? '#444'
  return `radial-gradient(110% 70% at 30% 20%, ${sw} 0%, color-mix(in srgb, ${sw} 55%, #000) 60%, color-mix(in srgb, ${sw} 25%, #000) 100%)`
}

/** Giostra 3D: le carte su un cerchio, che ruota di uno spicchio alla volta; la carta davanti è grande e nitida. */
function Carousel({ items }: { items: Product[] }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (i >= items.length - 1) return
    const t = setTimeout(() => setI((n) => n + 1), CAROUSEL_MS)
    return () => clearTimeout(t)
  }, [i, items.length])
  const step = 360 / items.length
  const front = items[i]
  return (
    <div className="flex flex-1 flex-col justify-center gap-8">
      <div className="relative mx-auto aspect-square w-[62%]" style={{ perspective: 1100 }}>
        <motion.div className="absolute inset-0" style={{ transformStyle: 'preserve-3d' }} animate={{ rotateY: -i * step }} transition={{ type: 'spring', stiffness: 60, damping: 16 }}>
          {items.map((p, k) => {
            const dist = Math.min(Math.abs(k - i), items.length - Math.abs(k - i))
            return (
              <motion.div
                key={p.id}
                className="absolute inset-0 overflow-hidden rounded-3xl bg-[#fff] shadow-[0_30px_60px_rgba(0,0,0,0.55)]"
                style={{ transform: `rotateY(${k * step}deg) translateZ(190px)`, backfaceVisibility: 'hidden' }}
                animate={{ opacity: dist === 0 ? 1 : dist === 1 ? 0.55 : 0.2, filter: dist === 0 ? 'none' : 'brightness(0.7)' }}
                transition={{ duration: 0.5 }}
              >
                <ProductImage product={p} eager className="size-full" />
              </motion.div>
            )
          })}
        </motion.div>
      </div>
      {/* Riflesso sul "pavimento" */}
      <div className="mx-auto -mt-6 h-6 w-1/2 rounded-[50%] bg-[#000]/60 blur-md" />
      <AnimatePresence mode="wait">
        <motion.div key={front.id} initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }} transition={{ duration: 0.35 }} className="space-y-1 px-6 text-center">
          <p className="text-xs font-bold tracking-[0.35em] text-[#e9d5ff] uppercase">
            {i + 1} / {items.length} · {front.brand}
          </p>
          <p className="line-clamp-2 text-lg font-semibold">{front.title}</p>
          <p className="text-3xl font-black">{formatPrice(freshPrice(front)!.price)}</p>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/** Posizioni del collage: un po' storte e di misure diverse, come foto appoggiate su un tavolo. */
const MOOD_SPOTS = [
  { left: '7%', top: '0%', w: '38%', r: -5 },
  { left: '55%', top: '3%', w: '37%', r: 4 },
  { left: '52%', top: '35%', w: '38%', r: -3 },
  { left: '5%', top: '33%', w: '37%', r: 3 },
  { left: '9%', top: '66%', w: '37%', r: -6 },
  { left: '54%', top: '67%', w: '37%', r: 5 },
]

function Moodboard({ items, color, from }: { items: Product[]; color: string; from: number }) {
  const light = ['Bianco', 'Beige', 'Rosa', 'Grigio'].includes(color)
  return (
    <div className={`flex flex-1 flex-col gap-4 ${light ? 'text-[#1c1917]' : 'text-[#fff]'}`}>
      <motion.div initial={{ opacity: 0, letterSpacing: '0.6em' }} animate={{ opacity: 1, letterSpacing: '0.25em' }} transition={{ duration: 1.2 }} className="text-center">
        <p className="text-xs font-bold uppercase opacity-70">Moodboard</p>
        <p className="font-serif text-5xl leading-none font-black uppercase italic">{color}</p>
      </motion.div>
      {/* Il collage si avvicina piano per tutta la durata: movimento lento da "video bello" */}
      <motion.div className="relative flex-1" initial={{ scale: 0.96 }} animate={{ scale: 1.05 }} transition={{ duration: 9.5, ease: 'linear' }}>
        {items.map((p, k) => {
          const spot = MOOD_SPOTS[k]
          return (
            <motion.div
              key={p.id}
              className="absolute rounded-2xl bg-[#fff] p-1.5 pb-6 shadow-[0_18px_40px_rgba(0,0,0,0.35)]"
              style={{ left: spot.left, top: spot.top, width: spot.w }}
              initial={{ y: 60, opacity: 0, rotate: spot.r * 3, scale: 1.15 }}
              animate={{ y: 0, opacity: 1, rotate: spot.r, scale: 1 }}
              transition={{ delay: 0.6 + k * 0.7, type: 'spring', stiffness: 120, damping: 15 }}
            >
              <ProductImage product={p} eager className="aspect-square w-full overflow-hidden rounded-xl" />
              <p className="absolute inset-x-2 bottom-1 truncate text-center text-[10px] font-bold text-[#44403c]">
                {p.brand} · {formatPrice(freshPrice(p)!.price)}
              </p>
            </motion.div>
          )
        })}
      </motion.div>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 5.4 }} className="text-center text-lg font-bold">
        6 pezzi · da {formatPrice(from)}
      </motion.p>
    </div>
  )
}

const RAIN_MS = 450
/** Le carte cadono dall'alto e si ammucchiano; poi la migliore offerta viene in primo piano. */
function Rain({ items, best }: { items: Product[]; best: Product }) {
  const [hero, setHero] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setHero(true), items.length * RAIN_MS + 900)
    return () => clearTimeout(t)
  }, [items.length])
  const fp = freshPrice(best)!
  return (
    <div className="flex flex-1 flex-col justify-center">
      <motion.p initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-4 text-center text-4xl font-black">
        {hero ? 'La migliore 👑' : 'Piovono offerte ☔'}
      </motion.p>
      <div className="relative mx-auto aspect-[3/4] w-[78%]">
        {items.map((p, k) => {
          const seed = (k * 37) % 11
          const isBest = p === best
          return (
            <motion.div
              key={p.id}
              className="absolute top-[12%] left-[10%] w-[80%] rounded-2xl bg-[#fff] p-1.5 text-[#111] shadow-[0_20px_40px_rgba(0,0,0,0.5)]"
              initial={{ y: -700, rotate: (seed - 5) * 9, opacity: 1 }}
              animate={
                hero
                  ? isBest
                    ? { y: -10, x: 0, rotate: 0, scale: 1.12, zIndex: 50, opacity: 1 }
                    : { y: 40 + seed * 4, x: (seed - 5) * 10, rotate: (seed - 5) * 4, scale: 0.9, opacity: 0.25 }
                  : { y: seed * 3, x: (seed - 5) * 9, rotate: (seed - 5) * 4, scale: 1 }
              }
              transition={hero ? { type: 'spring', stiffness: 140, damping: 16 } : { delay: k * (RAIN_MS / 1000), type: 'spring', stiffness: 170, damping: 17 }}
              style={{ zIndex: k }}
            >
              <ProductImage product={p} eager className="aspect-square w-full overflow-hidden rounded-xl" />
              <div className="flex items-center justify-between px-1.5 py-1">
                <span className="truncate text-xs font-bold uppercase">{p.brand}</span>
                <span className="rounded-lg bg-[#f43f5e] px-2 py-0.5 text-sm font-black text-[#fff]">-{freshPrice(p)!.discountPct}%</span>
              </div>
            </motion.div>
          )
        })}
      </div>
      <div className="h-20">
        {hero && (
          <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.3, type: 'spring', stiffness: 240, damping: 14 }} className="mt-6 flex items-baseline justify-center gap-3">
            <span className="text-5xl font-black">{formatPrice(fp.price)}</span>
            {fp.originalPrice && <span className="text-xl text-[#fff]/50 line-through">{formatPrice(fp.originalPrice)}</span>}
          </motion.div>
        )}
      </div>
    </div>
  )
}

/** Prodotti che cambiano ogni 120 ms, sempre più lenti verso la fine (ma non si ferma: lo ferma chi guarda). */
function StopReel({ items }: { items: Product[] }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setI((n) => n + 1), i < 40 ? 120 : 160)
    return () => clearTimeout(t)
  }, [i])
  const p = items[i % items.length]
  return (
    <div className="flex flex-1 flex-col justify-center gap-5 px-6">
      <motion.p animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 0.6 }} className="text-center text-3xl font-black">
        ✋ FERMA IL VIDEO
      </motion.p>
      <div className="overflow-hidden rounded-3xl bg-[#fff] p-2 shadow-2xl ring-4 ring-[#facc15]">
        <ProductImage product={p} eager className="aspect-square w-full overflow-hidden rounded-2xl" />
        <div className="flex items-center justify-between px-2 pt-2 text-[#111]">
          <span className="truncate text-sm font-bold uppercase">{p.brand}</span>
          <span className="text-xl font-black">{formatPrice(freshPrice(p)!.price)}</span>
        </div>
      </div>
      <p className="text-center text-lg font-semibold text-[#fff]/80">Quello che esce è il tuo regalo 🎁</p>
    </div>
  )
}

const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
/** Quattro mesi per schermata, in griglia 2x2. */
function MonthGrid({ items, part }: { items: Product[]; part: number }) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-3 px-5">
      <div className="grid grid-cols-2 gap-3">
        {items.slice(part * 4, part * 4 + 4).map((p, k) => (
          <motion.div key={p.id} initial={{ scale: 0.6, opacity: 0, rotate: k % 2 ? 6 : -6 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ delay: k * 0.35, type: 'spring', stiffness: 200, damping: 15 }} className="rounded-2xl bg-[#fff] p-1.5 text-[#111]">
            <p className="pb-1 text-center text-base font-black tracking-wide uppercase">{MONTHS[part * 4 + k]}</p>
            <ProductImage product={p} eager className="aspect-square w-full overflow-hidden rounded-xl" />
            <p className="truncate pt-1 text-center text-[11px] font-bold text-[#525252] uppercase">{p.brand}</p>
          </motion.div>
        ))}
      </div>
      <p className="text-center text-xl font-black">Di che mese sei? 👇</p>
    </div>
  )
}

/** Quattro pezzi numerati con il conto alla rovescia: ne puoi tenere uno solo. */
function KeepOne({ items, round }: { items: Product[]; round: number }) {
  // Conto alla rovescia dentro il fotogramma: le foto restano ferme, cambia solo il numero.
  const [count, setCount] = useState(5)
  useEffect(() => {
    if (count <= 1) return
    const t = setTimeout(() => setCount((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [count])
  return (
    <div className="flex flex-1 flex-col justify-center gap-4 px-5">
      <p className="text-center text-sm font-bold tracking-[0.3em] text-[#fb7185] uppercase">Round {round} di 3</p>
      <p className="text-center text-3xl leading-tight font-black">Puoi tenerne solo UNO 😩</p>
      <div className="grid grid-cols-2 gap-2.5">
        {items.map((p, k) => (
          <motion.div key={p.id} initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: k * 0.15 }} className="relative rounded-2xl bg-[#fff] p-1.5">
            <span className="absolute -top-2 -left-2 z-10 grid size-9 place-items-center rounded-full bg-[#f43f5e] text-lg font-black shadow-lg">{k + 1}</span>
            <ProductImage product={p} eager className="aspect-square w-full overflow-hidden rounded-xl" />
            <p className="truncate pt-1 text-center text-[11px] font-bold text-[#111] uppercase">
              {p.brand} · {formatPrice(freshPrice(p)!.price)}
            </p>
          </motion.div>
        ))}
      </div>
      <motion.p key={count} initial={{ scale: 1.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center text-6xl font-black">
        {count}
      </motion.p>
    </div>
  )
}

/** La settimana: cosa pubblicare ogni giorno (oggi evidenziato). Tocca un giorno per aprire quel formato. */
function Calendar({ current, onPick }: { current: Format; onPick: (f: Format) => void }) {
  const day = new Date().getDay()
  const label = (f: Format) => FORMATS.find((x) => x.id === f)!.label
  return (
    <div className="space-y-1.5">
      <p className="text-center text-xs text-[#fff]/75">
        Oggi pubblica: <b className="text-[#fff]">{label(WEEK[day])}</b> e, se vuoi un secondo post, <b className="text-[#fff]">{label(WEEK2[day])}</b> · nelle storie: Swipe in diretta
      </p>
      <div className="grid grid-cols-7 gap-1">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onPick(WEEK[d])}
            title={label(WEEK[d])}
            className={`rounded-lg py-1 text-[10px] leading-tight font-semibold ${
              d === day ? 'bg-[#f43f5e] text-[#fff]' : current === WEEK[d] ? 'bg-[#fff] text-[#111]' : 'bg-[#2a2a30] text-[#fff]/80'
            }`}
          >
            {DAY_NAMES[d]}
            <span className="block truncate px-0.5 font-normal opacity-80">{label(WEEK[d]).split(' ')[0]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Didascalia pronta per il post, da copiare con un tocco. */
function CaptionBox({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setOpen(true)
    }
  }
  return (
    <div className="rounded-xl bg-[#1c1c21] p-2.5 ring-1 ring-[#fff]/15">
      <button type="button" onClick={() => setOpen(!open)} className={`w-full text-left text-xs whitespace-pre-line text-[#fff]/85 ${open ? 'max-h-40 overflow-y-auto' : 'line-clamp-2'}`}>
        {text}
      </button>
      <button type="button" onClick={copy} className="mt-2 w-full rounded-lg bg-[#fff] py-1.5 text-sm font-bold text-[#111] active:scale-95">
        {copied ? 'Copiata ✓' : 'Copia didascalia'}
      </button>
    </div>
  )
}
