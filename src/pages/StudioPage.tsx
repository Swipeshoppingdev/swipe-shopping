import { AnimatePresence, motion } from 'framer-motion'
import { Heart, Play, RefreshCw, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { ProductImage } from '../components/ProductImage'
import { ADMIN_EMAIL } from '../config/app'
import { universeOf } from '../config/categories'
import { STYLE_LABEL, buildOutfits, outfitTotal, type Outfit } from '../lib/outfits'
import { formatPrice, freshPrice } from '../lib/price'
import { routeHref } from '../lib/useHashRoute'
import { useApp } from '../state/AppState'
import { useAuth } from '../state/AuthState'
import type { Product } from '../types/product'

/**
 * Studio (#/studio), solo per il titolare: video verticali per Instagram e TikTok, da registrare con la
 * registrazione schermo dell'iPhone. I contenuti cambiano ogni giorno; "Altri" ne propone di nuovi.
 * Le foto dei prodotti si mostrano come nell'app (mai modificate o unite).
 */
type Format = 'offerte' | 'sfida' | 'outfit' | 'swipe' | 'meme' | 'prezzo' | 'sconto' | 'marche'
const FORMATS: { id: Format; label: string }[] = [
  { id: 'offerte', label: 'Top 5 offerte' },
  { id: 'sfida', label: 'Questo o quello' },
  { id: 'outfit', label: 'Outfit sotto 100 €' },
  { id: 'swipe', label: 'Swipe in diretta' },
  { id: 'meme', label: 'Meme' },
  { id: 'prezzo', label: 'Indovina il prezzo' },
  { id: 'sconto', label: 'Prima e dopo' },
  { id: 'marche', label: 'Marche più amate' },
]
/** Formati con uomo/donna (gli outfit) */
const WITH_GENDER: Format[] = ['sfida', 'outfit']

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
}
/** I fotogrammi e la didascalia pronta per il post */
type Slides = Slide[] & { caption?: string }
const withCaption = (caption: string, slides: Slide[]): Slides => Object.assign(slides, { caption })

const TAGS = '#swipeshopping #shoppingonline #moda #offerte #outfit'
/** In fondo a ogni post: dove trovare l'app e la dicitura obbligatoria per i link di affiliazione. */
const FOOTER = `👉 Link in bio: swipeshopping.app\n\n#pubblicità ${TAGS}`

/** Calendario: un formato per giorno della settimana (0 = domenica), più le storie ogni giorno. */
const WEEK: Format[] = ['marche', 'offerte', 'sfida', 'prezzo', 'outfit', 'meme', 'sconto']
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
    // Swipe in diretta: carte che vanno da sole a destra o a sinistra, come se qualcuno usasse l'app.
    const cards = pick(
      moda.filter((p) => p.availability !== 'out_of_stock' && p.imageUrl && freshPrice(p)),
      8,
      rand,
    )
    const cap = `Sì o no? 👀 Il modo più veloce per fare shopping: uno swipe e via. Quale avresti tenuto?\n\n${FOOTER} #swipe #shoppingtime #tendenze`
    return withCaption(cap, [
      ...cards.map((p) => ({ ms: 1700, node: <AutoSwipe product={p} yes={rand() > 0.4} /> })),
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
  const previewAt: Partial<Record<Format, number>> = { swipe: 0, meme: 0, prezzo: 4, sconto: 2 }
  const current = slides[playing ? step : Math.min(previewAt[format] ?? 1, slides.length - 1)]

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#000]">
      {/* Il palco: 9:16, grande quanto lo schermo del telefono */}
      <div
        className="relative h-full max-h-[calc(100vw*16/9)] w-full max-w-[calc(100dvh*9/16)] overflow-hidden bg-gradient-to-b from-[#1a0b14] via-[#14080f] to-[#000] text-[#fff]"
        onClick={() => (playing ? stop() : setPanel((v) => !v))}
      >
        <div className="pointer-events-none absolute -top-32 -left-24 size-96 rounded-full bg-[#f43f5e]/25 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 -bottom-32 size-96 rounded-full bg-[#6366f1]/25 blur-3xl" />
        <AnimatePresence mode="wait">
          <motion.div
            key={`${format}-${variant}-${playing ? step : 'preview'}`}
            // Zona sicura dei Reels/TikTok: margine in alto, a destra (icone) e in basso (nome e didascalia).
            className="absolute top-[9%] right-[12%] bottom-[22%] left-[9%] flex flex-col"
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

function AutoSwipe({ product, yes }: { product: Product; yes: boolean }) {
  const dir = yes ? 1 : -1
  return (
    <div className="flex flex-1 flex-col justify-center px-6">
      <motion.div
        initial={{ x: 0, rotate: 0, opacity: 1 }}
        animate={{ x: [0, 0, dir * 40, dir * 520], rotate: [0, 0, dir * 4, dir * 24], opacity: [1, 1, 1, 0] }}
        transition={{ duration: 1.6, times: [0, 0.45, 0.7, 1], ease: 'easeIn' }}
        className="relative overflow-hidden rounded-3xl bg-[#fff] text-[#111] shadow-2xl"
      >
        <ProductImage product={product} eager className="aspect-square w-full" />
        <div className="space-y-0.5 p-4">
          <p className="text-[11px] font-semibold tracking-wide text-[#737373] uppercase">{product.brand}</p>
          <p className="line-clamp-1 font-semibold">{product.title}</p>
          {freshPrice(product) && <p className="text-lg font-black">{formatPrice(freshPrice(product)!.price)}</p>}
        </div>
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0, 1] }}
          transition={{ duration: 1.1, times: [0, 0.6, 1] }}
          className={`absolute top-6 rounded-xl border-4 px-3 py-1 text-3xl font-black ${
            yes ? 'left-6 -rotate-12 border-[#10b981] text-[#10b981]' : 'right-6 rotate-12 border-[#f43f5e] text-[#f43f5e]'
          }`}
        >
          {yes ? 'SÌ' : 'NO'}
        </motion.span>
      </motion.div>
      <div className="mt-6 flex justify-center gap-6">
        <span className={`grid size-16 place-items-center rounded-full bg-[#fff]/10 text-3xl font-black ${!yes ? 'ring-4 ring-[#f43f5e]' : ''}`}>
          <X className="size-8" />
        </span>
        <span className={`grid size-16 place-items-center rounded-full bg-[#f43f5e] ${yes ? 'ring-4 ring-[#fff]' : ''}`}>
          <Heart className="size-8 fill-current" />
        </span>
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

/** La settimana: cosa pubblicare ogni giorno (oggi evidenziato). Tocca un giorno per aprire quel formato. */
function Calendar({ current, onPick }: { current: Format; onPick: (f: Format) => void }) {
  const day = new Date().getDay()
  const label = (f: Format) => FORMATS.find((x) => x.id === f)!.label
  return (
    <div className="space-y-1.5">
      <p className="text-center text-xs text-[#fff]/75">
        Oggi pubblica: <b className="text-[#fff]">{label(WEEK[day])}</b> · nelle storie: Swipe in diretta
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
