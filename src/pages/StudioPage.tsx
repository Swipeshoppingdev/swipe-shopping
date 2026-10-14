import { AnimatePresence, motion } from 'framer-motion'
import { Heart, Play, RefreshCw, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { hasSupabase, supabaseRpc } from '../lib/supabase'
import { ProductImage } from '../components/ProductImage'
import { ADMIN_EMAIL } from '../config/app'
import { categoryLabel, universeOf, type CategoryId } from '../config/categories'
import { STYLE_LABEL, buildOutfits, outfitTotal, type Outfit } from '../lib/outfits'
import { formatPrice, freshPrice } from '../lib/price'
import { colorSwatch } from '../config/colors'
import { cheaperAlternatives, looksLike } from '../lib/priceCheck'
import { priceOptions } from '../lib/priceGame'
import { routeHref } from '../lib/useHashRoute'
import { useApp } from '../state/AppState'
import { useAuth } from '../state/AuthState'
import type { Product } from '../types/product'

/**
 * Studio (#/studio), solo per il titolare: video verticali per Instagram e TikTok, da registrare con la
 * registrazione schermo dell'iPhone. I contenuti cambiano ogni giorno; "Altri" ne propone di nuovi.
 * Le foto dei prodotti si mostrano come nell'app (mai modificate o unite).
 */
type Format =
  | 'offerte' | 'sfida' | 'outfit' | 'swipe' | 'meme' | 'prezzo' | 'sconto' | 'marche' | 'caro' | 'budget' | 'sotto' | 'regali'
  | 'colore' | 'vetrina' | 'mood' | 'pioggia' | 'stop' | 'mese' | 'tieni' | 'chat' | 'notifiche' | 'scontrino' | 'ruota'
  | 'slot' | 'cerca' | 'note' | 'furbo'
  | 'quale' | 'stima' | 'voto' | 'completa' | 'classifica' | 'intruso' | 'domanda' | 'ab' | 'marca'
type Group = 'offerte' | 'giochi' | 'stile' | 'risate' | 'belli' | 'post'
const GROUPS: { id: Group; label: string }[] = [
  { id: 'post', label: '💬 Post X, Threads, WhatsApp' },
  { id: 'risate', label: '😂 Divertenti' },
  { id: 'giochi', label: '🎮 Giochi' },
  { id: 'belli', label: '✨ Belli da vedere' },
  { id: 'offerte', label: '💸 Offerte' },
  { id: 'stile', label: '👗 Outfit e stile' },
]
/** Ogni formato: nome, icona, a cosa serve (una riga) e il gruppo del menu. */
const FORMATS: { id: Format; label: string; emoji: string; desc: string; group: Group }[] = [
  { id: 'quale', label: 'Quale scegli?', emoji: '🔢', desc: '4 pezzi numerati, si risponde col numero', group: 'post' },
  { id: 'stima', label: 'Quanto costa?', emoji: '🤑', desc: 'Prezzo nascosto, A, B o C', group: 'post' },
  { id: 'voto', label: 'Voto da 1 a 10', emoji: '💯', desc: 'Un pezzo solo, tutti danno il voto', group: 'post' },
  { id: 'completa', label: 'Completa l\'outfit', emoji: '🧩', desc: 'Manca un pezzo: cosa ci metti?', group: 'post' },
  { id: 'classifica', label: 'Fai la classifica', emoji: '📊', desc: 'A, B, C, D dal più bello', group: 'post' },
  { id: 'intruso', label: 'Uno costa il triplo', emoji: '🕵️', desc: 'Trova quello carissimo', group: 'post' },
  { id: 'ab', label: 'A o B?', emoji: '⚖️', desc: 'Due pezzi a confronto, si vota', group: 'post' },
  { id: 'marca', label: 'Di che marca è?', emoji: '🏷️', desc: 'Marca nascosta, A, B o C', group: 'post' },
  { id: 'domanda', label: 'Domanda del giorno', emoji: '❓', desc: 'Solo testo, fa discutere', group: 'post' },
  { id: 'stop', label: 'Ferma il video', emoji: '✋', desc: 'Quello che esce è il tuo regalo', group: 'risate' },
  { id: 'mese', label: 'Il tuo mese', emoji: '📅', desc: 'Il mese di nascita è il tuo outfit', group: 'risate' },
  { id: 'chat', label: 'Chat', emoji: '💬', desc: 'Conversazione con un finale da ridere', group: 'risate' },
  { id: 'note', label: 'Note del telefono', emoji: '📝', desc: 'Buoni propositi cancellati, uno a uno', group: 'risate' },
  { id: 'meme', label: 'Meme', emoji: '🤣', desc: 'Frasi pronte o scritte da te', group: 'risate' },
  { id: 'tieni', label: 'Tienine uno', emoji: '😩', desc: '4 pezzi, ne puoi tenere solo uno', group: 'risate' },
  { id: 'slot', label: 'Slot machine', emoji: '🎰', desc: 'Tre rulli, esce un outfit completo', group: 'giochi' },
  { id: 'ruota', label: 'La ruota', emoji: '🎡', desc: 'La ruota decide cosa compri', group: 'giochi' },
  { id: 'prezzo', label: 'Indovina il prezzo', emoji: '💸', desc: '3 prodotti, conto alla rovescia', group: 'giochi' },
  { id: 'caro', label: 'Quale costa di più?', emoji: '👑', desc: 'Sfide a due, poi i prezzi', group: 'giochi' },
  { id: 'sfida', label: 'Questo o quello', emoji: '🆚', desc: 'Due outfit, A o B', group: 'giochi' },
  { id: 'vetrina', label: 'Vetrina 3D', emoji: '🎠', desc: 'Giostra in prospettiva di 6 capi', group: 'belli' },
  { id: 'mood', label: 'Moodboard', emoji: '🎨', desc: 'Capi di un colore, come un collage', group: 'belli' },
  { id: 'pioggia', label: 'Pioggia di offerte', emoji: '☔', desc: 'Le offerte cadono in un mucchio', group: 'belli' },
  { id: 'cerca', label: 'Ricerca', emoji: '🔍', desc: 'Si scrive la ricerca, escono i risultati', group: 'belli' },
  { id: 'notifiche', label: 'Notifiche', emoji: '🔔', desc: 'Offerte che arrivano sul telefono', group: 'belli' },
  { id: 'swipe', label: 'Swipe in diretta', emoji: '👆', desc: 'Il mazzo che si sfoglia da solo', group: 'belli' },
  { id: 'offerte', label: 'Top 5 offerte', emoji: '🔥', desc: 'Le più scontate di oggi', group: 'offerte' },
  { id: 'scontrino', label: 'Scontrino', emoji: '🧾', desc: 'Quanto risparmi, riga per riga', group: 'offerte' },
  { id: 'furbo', label: 'Il caro e il furbo', emoji: '🦊', desc: 'Lo stesso pezzo, che costa meno', group: 'offerte' },
  { id: 'sconto', label: 'Prima e dopo', emoji: '📉', desc: 'Prezzo pieno contro prezzo di oggi', group: 'offerte' },
  { id: 'sotto', label: 'Top 5 sotto…', emoji: '🏷️', desc: 'Una categoria sotto una soglia', group: 'offerte' },
  { id: 'budget', label: 'Cosa compri con…', emoji: '👛', desc: '30, 50 o 100 € e cosa avanza', group: 'offerte' },
  { id: 'regali', label: 'Idee regalo', emoji: '🎁', desc: 'Per lei o per lui, sotto soglia', group: 'offerte' },
  { id: 'outfit', label: 'Outfit sotto 100 €', emoji: '🧥', desc: 'Look completo pezzo per pezzo', group: 'stile' },
  { id: 'colore', label: 'Total colore', emoji: '⚫', desc: '4 pezzi dello stesso colore', group: 'stile' },
  { id: 'marche', label: 'Marche più amate', emoji: '🏆', desc: 'Classifica dai Sì della settimana', group: 'stile' },
]
/** Formati con uomo/donna (gli outfit) */
const WITH_GENDER: Format[] = ['ab', 'marca', 'quale', 'voto', 'completa', 'classifica', 'sfida', 'outfit', 'budget', 'regali', 'colore', 'vetrina', 'mood', 'stop', 'mese', 'tieni', 'chat', 'slot', 'cerca', 'note', 'furbo']

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

/**
 * Post da commentare per X, Threads e il canale WhatsApp: un'immagine ferma 4:5 (la mostrano intera tutti e tre),
 * da salvare con uno screenshot. Sul canale WhatsApp non si commenta: si risponde con le reazioni o con un sondaggio.
 */
const POSTS: Format[] = ['quale', 'stima', 'voto', 'completa', 'classifica', 'intruso', 'domanda', 'ab', 'marca']
/** Il post del giorno per X, Threads e il canale WhatsApp (0 = domenica) */
const WEEK_POST: Format[] = ['domanda', 'quale', 'stima', 'ab', 'completa', 'voto', 'marca']
/** Categorie dove la marca non si legge sul prodotto: "Di che marca è?" resta un gioco vero */
const NO_LOGO = new Set(['scarpe_eleganti', 'stivali', 'camicie', 'cappotti', 'vestiti', 'maglioni', 'giacche', 'pantaloni'])
/** Reazioni rapide di WhatsApp, una per risposta (1-4 o A-D) */
const WA_REACT = ['👍', '❤️', '😂', '😮']
const POST_FOOT = 'swipeshopping.app #pubblicità'
/** Domande solo testo: niente prodotti, fanno rispondere tutti (anche chi non compra). */
const DOMANDE: { kicker: string; text: string; a?: string; b?: string }[] = [
  { kicker: 'Questo o quello', text: 'Sneakers bianche o sneakers nere?', a: 'Bianche', b: 'Nere' },
  { kicker: 'Questo o quello', text: 'Jeans larghi o jeans skinny?', a: 'Larghi', b: 'Skinny' },
  { kicker: 'Questo o quello', text: 'Borsa grande o borsa piccola?', a: 'Grande', b: 'Piccola' },
  { kicker: 'Questo o quello', text: 'Felpa o maglione?', a: 'Felpa', b: 'Maglione' },
  { kicker: 'Questo o quello', text: 'Shopping in negozio o online?', a: 'Negozio', b: 'Online' },
  { kicker: 'Questo o quello', text: 'Oro o argento?', a: 'Oro', b: 'Argento' },
  { kicker: 'Questo o quello', text: 'Stivali o anfibi?', a: 'Stivali', b: 'Anfibi' },
  { kicker: 'Questo o quello', text: 'Profumo dolce o fresco?', a: 'Dolce', b: 'Fresco' },
  { kicker: 'Questo o quello', text: 'Cappotto lungo o piumino?', a: 'Cappotto', b: 'Piumino' },
  { kicker: 'Questo o quello', text: 'Tutto nero o tutto colorato?', a: 'Nero', b: 'Colori' },
  { kicker: 'Questo o quello', text: 'Zaino o borsa a tracolla?', a: 'Zaino', b: 'Tracolla' },
  { kicker: 'Questo o quello', text: 'Comprare una cosa costosa o tre economiche?', a: 'Una costosa', b: 'Tre economiche' },
  { kicker: 'Opinione impopolare', text: 'I calzini con i sandali stanno bene. D\'accordo?', a: 'D\'accordo', b: 'Mai' },
  { kicker: 'Opinione impopolare', text: 'Il Black Friday non conviene davvero. D\'accordo?', a: 'D\'accordo', b: 'Conviene' },
  { kicker: 'Opinione impopolare', text: 'Le sneakers con il vestito elegante stanno benissimo.', a: 'Vero', b: 'No' },
  { kicker: 'Opinione impopolare', text: 'Il marrone è più elegante del nero.', a: 'Vero', b: 'No' },
  { kicker: 'Opinione impopolare', text: 'Le marche costose non durano di più.', a: 'Vero', b: 'Falso' },
  { kicker: 'Opinione impopolare', text: 'La tuta va bene anche per uscire.', a: 'Sì', b: 'No' },
  { kicker: 'Dimmi la verità', text: 'Quanti vestiti hai che non hai mai messo?', a: 'Zero', b: 'Troppi' },
  { kicker: 'Dimmi la verità', text: 'Hai mai comprato una cosa solo perché era scontata?', a: 'Sì', b: 'Mai' },
  { kicker: 'Dimmi la verità', text: 'Quante volte apri un\'app di shopping al giorno?', a: '1 o 2', b: 'Ho perso il conto' },
  { kicker: 'Dimmi la verità', text: 'Nascondi i pacchi a casa?', a: 'Sì', b: 'No' },
  { kicker: 'Dimmi la verità', text: 'Il carrello pieno che non compri mai: ce l\'hai?', a: 'Sì', b: 'No' },
  { kicker: 'Dimmi la verità', text: 'Hai mai tenuto un vestito che dovevi restituire?', a: 'Sì', b: 'No' },
  { kicker: 'Domanda del giorno', text: 'Qual è l\'acquisto che rimpiangi di più?' },
  { kicker: 'Domanda del giorno', text: 'Il capo che metti di più in assoluto?' },
  { kicker: 'Domanda del giorno', text: 'Quanto spenderesti al massimo per un paio di scarpe?' },
  { kicker: 'Domanda del giorno', text: 'Descrivi il tuo stile in 3 emoji.' },
  { kicker: 'Domanda del giorno', text: 'Il regalo più bello che hai ricevuto?' },
  { kicker: 'Domanda del giorno', text: 'La marca che compri sempre?' },
  { kicker: 'Domanda del giorno', text: 'Cosa non può mancare nel tuo armadio?' },
  { kicker: 'Domanda del giorno', text: 'Il colore che non metteresti mai?' },
  { kicker: 'Domanda del giorno', text: 'Cosa compreresti con 50 € adesso?' },
  { kicker: 'Domanda del giorno', text: 'Il tuo outfit perfetto per il primo appuntamento?' },
  { kicker: 'Completa la frase', text: 'Non esco mai di casa senza…' },
  { kicker: 'Completa la frase', text: 'Il mio armadio in una parola è…' },
  { kicker: 'Completa la frase', text: 'Se vinco 1000 € compro subito…' },
  { kicker: 'Completa la frase', text: 'La moda che non capirò mai è…' },
]

/** Un fotogramma del video: cosa mostrare e per quanti millisecondi */
interface Slide {
  ms: number
  node: ReactNode
  /** Sfondo a tutto schermo per questo fotogramma (i formati "belli"): sostituisce il gradiente scuro */
  bg?: string
  /** Fotogrammi consecutivi con lo stesso group restano fermi: cambia solo il contenuto (es. i secondi del countdown) */
  group?: string
}
/** I fotogrammi e la didascalia pronta per il post; per i post anche la versione per il canale WhatsApp e una nota solo per il titolare (la risposta giusta) */
type Slides = Slide[] & { caption?: string; wa?: string; note?: string }
const withCaption = (caption: string, slides: Slide[], extra?: { wa?: string; note?: string }): Slides => Object.assign(slides, { caption }, extra)

const TAGS = '#swipeshopping #shoppingonline #moda #offerte #outfit'
/** In fondo a ogni post: dove trovare l'app e la dicitura obbligatoria per i link di affiliazione. */
const FOOTER = `👉 Link in bio: swipeshopping.app\n\n#pubblicità ${TAGS}`

/** Calendario: un formato per giorno della settimana (0 = domenica), più le storie ogni giorno. */
const WEEK: Format[] = ['marche', 'offerte', 'sfida', 'prezzo', 'outfit', 'meme', 'sconto']
/** Il secondo post del giorno (chi vuole pubblicare di più). */
const WEEK2: Format[] = ['note', 'stop', 'chat', 'slot', 'cerca', 'ruota', 'furbo']
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
        if (chosen.length < 4 && !chosen.some((c) => c.category === p.category)) chosen.push(p)
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
          ...[3, 2, 1].map((n) => ({ ms: 900, group: `g${i}`, node: <Guess product={p} index={i + 1} count={n} /> })),
          { ms: 2800, group: `g${i}`, node: <Guess product={p} index={i + 1} /> },
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
          ...[3, 2, 1].map((n) => ({ ms: 900, group: `c${i}`, node: <WhichPricier a={a} b={b} index={i + 1} count={n} /> })),
          { ms: 3000, group: `c${i}`, node: <WhichPricier a={a} b={b} index={i + 1} /> },
        ]),
        { ms: 3000, node: <Outro line="Quante ne hai indovinate? 👇 Gioca su" /> },
      ])
    }
    // Moda del genere scelto (e unisex)
    const forGender = (p: Product) => p.gender === gender || p.gender === 'unisex'
    if (POSTS.includes(format)) {
      // Post fermi: n prodotti della stessa categoria (titolo coerente con la categoria), marche diverse.
      const sameCategory = (pool: Product[], n: number) => {
        const byCat = new Map<string, Product[]>()
        for (const p of pick(pool, 1500, rand)) {
          const list = byCat.get(p.category) ?? []
          if (list.some((x) => x.brand === p.brand)) continue
          list.push(p)
          if (list.length === n) return list
          byCat.set(p.category, list)
        }
        return null
      }
      const modaPool = moda.filter((p) => inStock(p) && forGender(p) && looksLike(p) && !freshPrice(p)!.from)
      const label = (p: Product) => categoryLabel(p.category as CategoryId)
      if (format === 'quale') {
        const items = sameCategory(modaPool, 4)
        if (!items) return []
        const cat = label(items[0]).toLowerCase()
        return withCaption(
          `Quale scegli? 1, 2, 3 o 4? 👇\n\n${label(items[0])} da ${gender}, prezzi di oggi.\n\n${POST_FOOT}`,
          [{ ms: 60_000, node: <PostGrid kicker={`${cat} da ${gender}`} title="QUALE SCEGLI?" items={items} labels={['1', '2', '3', '4']} prices /> }],
          { wa: `Quale scegli? 🤔 Rispondi con una reazione:\n${WA_REACT.map((e, i) => `${e} = ${i + 1}`).join('   ')}\n\nswipeshopping.app` },
        )
      }
      if (format === 'ab') {
        const items = sameCategory(modaPool, 2)
        if (!items) return []
        return withCaption(
          `A o B? ⚖️ Scrivilo nei commenti 👇\n\n${label(items[0])} da ${gender}, prezzi di oggi.\n\n${POST_FOOT}`,
          [{ ms: 60_000, node: <PostPair kicker={`${label(items[0]).toLowerCase()} da ${gender}`} items={items} /> }],
          { wa: `A o B? ⚖️\n👍 = A   ❤️ = B\n\nswipeshopping.app` },
        )
      }
      if (format === 'marca') {
        // La marca vera e due marche finte della stessa categoria (vere marche del catalogo).
        const pool = modaPool.filter((p) => p.brand && NO_LOGO.has(p.category))
        for (const p of pick(pool, 80, rand)) {
          const others = [...new Set(pool.filter((x) => x.category === p.category && x.brand !== p.brand).map((x) => x.brand!))]
          if (others.length < 2) continue
          const opts = pick([p.brand!, ...pick(others, 2, rand)], 3, rand)
          const right = 'ABC'[opts.indexOf(p.brand!)]
          return withCaption(
            `Di che marca è? 🏷️ A, B o C? 👇\n\nRisposta tra qualche ora.\n\n${POST_FOOT}`,
            [{ ms: 60_000, node: <PostBrand product={p} options={opts} /> }],
            {
              wa: `Di che marca è? 🏷️\n${opts.map((o, i) => `${WA_REACT[i]} = ${o}`).join('\n')}\n\nswipeshopping.app`,
              note: `Risposta: ${right} (${p.brand}, ${formatPrice(freshPrice(p)!.price)}).`,
            },
          )
        }
        return []
      }
      if (format === 'classifica') {
        const items = sameCategory(modaPool, 4)
        if (!items) return []
        return withCaption(
          `Mettili in classifica dal più bello al meno bello 👇\nTipo: B, A, D, C\n\n${label(items[0])} da ${gender}.\n\n${POST_FOOT}`,
          [{ ms: 60_000, node: <PostGrid kicker={`${label(items[0]).toLowerCase()} da ${gender}`} title="FAI LA CLASSIFICA" sub="dal più bello al meno bello" items={items} labels={['A', 'B', 'C', 'D']} /> }],
          { wa: `Il più bello per te? Rispondi con una reazione:\n${WA_REACT.map((e, i) => `${e} = ${'ABCD'[i]}`).join('   ')}\n\nswipeshopping.app` },
        )
      }
      if (format === 'intruso') {
        // Quattro pezzi della stessa categoria: uno costa almeno il triplo degli altri tre.
        const pool = allProducts.filter((p) => inStock(p) && looksLike(p) && !freshPrice(p)!.from && (universeOf(p.category) !== 'moda' || forGender(p)))
        const byCat = new Map<string, Product[]>()
        for (const p of pick(pool, 3000, rand)) byCat.set(p.category, [...(byCat.get(p.category) ?? []), p])
        for (const list of byCat.values()) {
          const top = list.reduce((m, p) => (freshPrice(p)!.price > freshPrice(m)!.price ? p : m), list[0])
          const cheap: Product[] = []
          for (const p of list) {
            if (cheap.length < 3 && p.brand !== top.brand && freshPrice(p)!.price * 3 <= freshPrice(top)!.price && !cheap.some((x) => x.brand === p.brand)) cheap.push(p)
          }
          if (cheap.length < 3 || freshPrice(top)!.price < 30) continue
          const items = pick([top, ...cheap], 4, rand)
          const n = items.indexOf(top) + 1
          return withCaption(
            `Uno di questi costa almeno il triplo degli altri. Quale? 🕵️ 1, 2, 3 o 4? 👇\n\nRisposta tra qualche ora.\n\n${POST_FOOT}`,
            [{ ms: 60_000, node: <PostGrid kicker={label(top).toLowerCase()} title="UNO COSTA IL TRIPLO" sub="Quale?" items={items} labels={['1', '2', '3', '4']} /> }],
            {
              wa: `Uno costa almeno il triplo degli altri: quale? 🕵️\n${WA_REACT.map((e, i) => `${e} = ${i + 1}`).join('   ')}\n\nswipeshopping.app`,
              note: `Risposta: il numero ${n} (${top.brand ?? ''}, ${formatPrice(freshPrice(top)!.price)}). Gli altri: ${items.filter((p) => p !== top).map((p) => formatPrice(freshPrice(p)!.price)).join(', ')}.`,
            },
          )
        }
        return []
      }
      if (format === 'stima') {
        for (const p of pick(allProducts.filter((p) => inStock(p) && looksLike(p) && freshPrice(p)!.price >= 20), 60, rand)) {
          const opts = priceOptions(p, rand)
          if (!opts) continue
          const right = 'ABC'[opts.options.indexOf(opts.price)]
          return withCaption(
            `Quanto costa? 🤑 A, B o C? Scrivilo nei commenti 👇\n\nRisposta tra qualche ora.\n\n${POST_FOOT}`,
            [{ ms: 60_000, node: <PostGuess product={p} options={opts.options} /> }],
            {
              wa: `Quanto costa? 🤑\n${opts.options.map((o, i) => `${WA_REACT[i]} = ${formatPrice(o)}`).join('\n')}\n\nswipeshopping.app`,
              note: `Risposta: ${right} (${formatPrice(opts.price)}). Scrivila sotto il post dopo qualche ora.`,
            },
          )
        }
        return []
      }
      if (format === 'voto') {
        const [p] = pick(modaPool.filter((p) => p.brand), 1, rand)
        if (!p) return []
        return withCaption(
          `Voto da 1 a 10? 👇 Si accettano anche gli 0.\n\n${p.brand} a ${formatPrice(freshPrice(p)!.price)}, oggi.\n\n${POST_FOOT}`,
          [{ ms: 60_000, node: <PostVote product={p} /> }],
          { wa: `Lo prenderesti? 🤔\n🔥 = sì subito   👍 = forse   😂 = mai\n\nswipeshopping.app` },
        )
      }
      if (format === 'completa') {
        const SHOES = /scarpe|sneaker|stivali|anfibi|mocassin|décolleté|sandali|ballerine/i
        const ok = outfits.filter((o) => o.items.length === 4)
        const [o] = pick(ok, 1, rand)
        if (!o) return []
        const missing = o.items.find((p) => SHOES.test(label(p))) ?? o.items[3]
        const shown = o.items.filter((p) => p !== missing)
        const what = label(missing).toLowerCase()
        return withCaption(
          `Completa l'outfit 🧩 Manca un pezzo: ${what}. Cosa ci metteresti? 👇\n\n${POST_FOOT}`,
          [{ ms: 60_000, node: <PostMissing items={shown} what={label(missing)} gender={o.gender} /> }],
          {
            wa: `Completa l'outfit 🧩 Manca: ${what}.\n👍 = classico   ❤️ = colorato   😮 = esagerato\n\nswipeshopping.app`,
            note: `Nel look originale: ${missing.brand ?? ''} ${label(missing)} a ${formatPrice(freshPrice(missing)?.price ?? 0)}.`,
          },
        )
      }
      // Domanda del giorno: solo testo
      const [q] = pick(DOMANDE, 1, rand)
      const choice = q.a && q.b
      return withCaption(
        `${q.text} 👇\n\nswipeshopping.app`,
        [{ ms: 60_000, node: <PostQuestion kicker={q.kicker} text={q.text} a={q.a} b={q.b} /> }],
        {
          wa: choice
            ? `${q.text}\n👍 = ${q.a}   ❤️ = ${q.b}\n\nswipeshopping.app`
            : `${q.text}\nRispondi con un'emoji 👇\n\nswipeshopping.app`,
        },
      )
    }
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
      for (const p of pick(list, list.length, rand)) if (chosen.length < 4 && !chosen.some((c) => c.brand === p.brand)) chosen.push(p)
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
        if (chosen.length < 4 && !chosen.some((c) => c.category === p.category || c.brand === p.brand)) chosen.push(p)
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
    if (format === 'chat') {
      // Una chat inventata (testi fissi, persone generiche) con il prodotto come link: il finale fa ridere.
      const withDeal = moda.filter((p) => inStock(p) && forGender(p) && (freshPrice(p)!.discountPct ?? 0) >= 15)
      const [p] = pick(withDeal.length ? withDeal : moda.filter((p) => inStock(p) && forGender(p)), 1, rand)
      if (!p) return []
      const fp = freshPrice(p)!
      const [script] = pick(CHATS.filter((c) => fp.discountPct || !c.lines.some((l) => l.text?.includes('{sconto}'))), 1, rand)
      const fill = (t: string) => t.replaceAll('{marca}', p.brand ?? 'questo').replaceAll('{prezzo}', formatPrice(fp.price)).replaceAll('{sconto}', `${fp.discountPct ?? 0}%`)
      const lines = script.lines.map((l) => ({ ...l, text: l.text && fill(l.text) }))
      const cap = `${script.hook} 😂\n\nTagga chi ti scriverebbe così 👇\n\n${FOOTER} #chat #relatable #shoppingaddict`
      return withCaption(cap, [
        { ms: lines.length * CHAT_MS + 2600, node: <Chat name={script.name} lines={lines} product={p} />, bg: '#000' },
        { ms: 3000, node: <Outro line="Lo trovi su" /> },
      ])
    }
    if (format === 'notifiche') {
      // Schermata di blocco: arrivano le notifiche delle offerte (come quelle vere dell'app), una sotto l'altra.
      const chosen: Product[] = []
      for (const p of pick(discounted(20), 300, rand)) if (chosen.length < 4 && !chosen.some((c) => c.category === p.category || c.brand === p.brand)) chosen.push(p)
      if (chosen.length < 4) return []
      const cap = `Il mio telefono quando attivo le notifiche delle offerte 📲🔥 ${chosen.map((p) => `${p.brand} -${freshPrice(p)!.discountPct}%`).join(' · ')}\n\nLe attivi anche tu? 👇 Prezzi di oggi, possono cambiare.\n\n${FOOTER} #notifiche #offerte #sconti`
      return withCaption(cap, [
        { ms: chosen.length * NOTIF_MS + 3200, node: <LockScreen items={chosen} />, bg: LOCK_BG },
        { ms: 3000, node: <Outro line="Attiva le notifiche su" /> },
      ])
    }
    if (format === 'scontrino') {
      // Uno scontrino che si stampa riga per riga: prezzo pieno, prezzo di oggi e quanto si risparmia.
      const chosen: Product[] = []
      for (const p of pick(discounted(20), 300, rand)) if (chosen.length < 4 && !chosen.some((c) => c.category === p.category)) chosen.push(p)
      if (chosen.length < 4) return []
      const full = chosen.reduce((t, p) => t + (freshPrice(p)!.originalPrice ?? freshPrice(p)!.price), 0)
      const paid = chosen.reduce((t, p) => t + freshPrice(p)!.price, 0)
      const cap = `Lo scontrino della mia wishlist 🧾 ${chosen.length} pezzi: ${formatPrice(paid)} invece di ${formatPrice(full)}, ${formatPrice(full - paid)} risparmiati 😮\n\nQuanto avresti speso tu? 👇 Prezzi di oggi, possono cambiare.\n\n${FOOTER} #scontrino #risparmio #offerte`
      return withCaption(cap, [{ ms: 9000, node: <Receipt items={chosen} full={full} paid={paid} />, bg: RECEIPT_BG }, { ms: 3000, node: <Outro line="Le offerte di oggi su" /> }])
    }
    if (format === 'ruota') {
      // La ruota gira e sceglie una categoria; poi esce un prodotto di quella categoria.
      const byCat = new Map<string, Product[]>()
      for (const p of allProducts) {
        if (!inStock(p) || !p.imageUrl) continue
        const list = byCat.get(p.category) ?? []
        list.push(p)
        byCat.set(p.category, list)
      }
      const cats = pick([...byCat].filter(([, l]) => l.length >= 10).map(([c]) => c), 8, rand)
      if (cats.length < 8) return []
      const win = Math.floor(rand() * 8)
      const winners = byCat.get(cats[win])!
      const [p] = pick(winners.filter((q) => (freshPrice(q)!.discountPct ?? 0) >= 10).length ? winners.filter((q) => (freshPrice(q)!.discountPct ?? 0) >= 10) : winners, 1, rand)
      const name = categoryLabel(cats[win] as CategoryId)
      const cap = `La ruota decide cosa compro 🎡 È uscito: ${name.toLowerCase()}! ${p.brand} a ${formatPrice(freshPrice(p)!.price)}.\n\nFai screenshot quando si ferma: cosa sarebbe uscito a te? 👇\n\n${FOOTER} #ruota #challenge #lasortedecide`
      return withCaption(cap, [
        { ms: 9800, node: <Wheel labels={cats.map((c) => categoryLabel(c as CategoryId))} win={win} product={p} /> },
        { ms: 3000, node: <Outro line="Gira anche tu su" /> },
      ])
    }
    if (format === 'slot') {
      // Slot machine: tre rulli che girano tra i capi e si fermano uno alla volta su un outfit vero.
      const [o] = pick(outfits.filter((o) => o.items.length >= 3 && o.items.slice(0, 3).every(inStock)), 1, rand)
      const pool = pick(moda.filter((p) => inStock(p) && forGender(p)), 30, rand)
      if (!o || pool.length < 30) return []
      const items = o.items.slice(0, 3)
      const total = items.reduce((t, p) => t + freshPrice(p)!.price, 0)
      const cap = `La slot machine dell'outfit 🎰 È uscito un look ${STYLE_LABEL[o.style].toLowerCase()} da ${gender} a ${formatPrice(total)}: ${items.map((p) => p.brand).filter(Boolean).join(' + ')}.\n\nJackpot o da rigirare? Scrivilo nei commenti 👇\n\n${FOOTER} #slotmachine #outfit #ootd`
      return withCaption(cap, [
        { ms: 1800, node: <Title kicker="Gioco" title="SLOT DELL'OUTFIT" sub="Tre rulli, un look completo 🎰" /> },
        { ms: 7600, node: <Slot items={items} pool={pool} total={total} />, bg: SLOT_BG },
        { ms: 3000, node: <Outro line="Gira anche tu su" /> },
      ])
    }
    if (format === 'cerca') {
      // Una ricerca che si scrive da sola ("<categoria> da donna sotto 30 €") e i risultati veri che compaiono in lista.
      const byCat = new Map<string, Product[]>()
      for (const p of moda) {
        if (!inStock(p) || p.gender !== gender) continue
        const list = byCat.get(p.category) ?? []
        list.push(p)
        byCat.set(p.category, list)
      }
      for (const [cat, list] of pick([...byCat], byCat.size, rand)) {
        const limit = [20, 30, 50, 80].find((n) => list.filter((p) => freshPrice(p)!.price <= n).length >= 12)
        if (!limit) continue
        const results = pick(list.filter((p) => freshPrice(p)!.price <= limit), 4, rand).sort((a, b) => freshPrice(a)!.price - freshPrice(b)!.price)
        const count = list.filter((p) => freshPrice(p)!.price <= limit).length
        const query = `${categoryLabel(cat as CategoryId).toLowerCase()} da ${gender} sotto ${limit} €`
        const cap = `Quando cerchi "${query}" 🔍 e trovi questi: ${results.map((p) => `${p.brand} ${formatPrice(freshPrice(p)!.price)}`).join(' · ')}\n\nCosa vuoi che cerchi la prossima volta? 👇 Prezzi di oggi, possono cambiare.\n\n${FOOTER} #cercasubito #sotto${limit}euro #offerte`
        return withCaption(cap, [
          { ms: 9000, node: <Search query={query} results={results} count={count} />, bg: SEARCH_BG },
          { ms: 3000, node: <Outro line="Cerca anche tu su" /> },
        ])
      }
      return []
    }
    if (format === 'note') {
      // L'app Note: i buoni propositi del mese si cancellano uno alla volta, l'ultima riga è un prodotto vero.
      const withDeal = moda.filter((p) => inStock(p) && forGender(p) && (freshPrice(p)!.discountPct ?? 0) >= 15)
      const [p] = pick(withDeal.length ? withDeal : moda.filter((p) => inStock(p) && forGender(p)), 1, rand)
      if (!p) return []
      const fp = freshPrice(p)!
      const [script] = pick(NOTES.filter((n) => fp.discountPct || !n.end.includes('{sconto}')), 1, rand)
      const month = new Date().toLocaleDateString('it-IT', { month: 'long' })
      const fill = (t: string) => t.replaceAll('{mese}', month).replaceAll('{marca}', p.brand ?? 'questo').replaceAll('{prezzo}', formatPrice(fp.price)).replaceAll('{sconto}', `${fp.discountPct ?? 0}%`)
      const title = fill(script.title)
      const cap = `${title} 📝 Com'è andata? Come sempre 😂\n\nTagga chi ha la stessa lista 👇\n\n${FOOTER} #buonipropositi #relatable #shoppingaddict`
      return withCaption(cap, [
        { ms: script.lines.length * NOTE_MS + 4200, node: <Notes title={title} lines={script.lines} end={fill(script.end)} product={p} />, bg: NOTES_BG },
        { ms: 3000, node: <Outro line="Lo trovi su" /> },
      ])
    }
    if (format === 'furbo') {
      // Il caro e il furbo: un capo e uno simile che costa meno (stessa categoria, prezzi di oggi).
      const pairs: [Product, Product][] = []
      for (const p of pick(moda.filter((p) => inStock(p) && forGender(p) && p.store === 'amazon' && freshPrice(p)!.price >= 40), 200, rand)) {
        if (pairs.length >= 2) break
        if (pairs.some(([a]) => a.category === p.category)) continue
        const alt = cheaperAlternatives(p, moda, 1)[0]?.product
        if (alt && alt.store === 'amazon' && inStock(alt)) pairs.push([p, alt])
      }
      if (pairs.length < 2) return []
      const saved = pairs.reduce((t, [a, b]) => t + freshPrice(a)!.price - freshPrice(b)!.price, 0)
      const cap = `Il caro e il furbo 🦊 Stesso stile, ${formatPrice(saved)} in meno in tasca.\n\nTu sei il caro o il furbo? 👇 Prezzi di oggi, possono cambiare.\n\n${FOOTER} #dupe #risparmio #moda`
      return withCaption(cap, [
        { ms: 1800, node: <Title kicker={`Da ${gender}`} title="IL CARO E IL FURBO" sub="Stesso stile, prezzo diverso 🦊" /> },
        ...pairs.flatMap(([a, b], i) => [
          { ms: 1800, group: `f${i}`, node: <Dupe a={a} b={b} stage={0} /> },
          { ms: 1600, group: `f${i}`, node: <Dupe a={a} b={b} stage={1} /> },
          { ms: 2600, group: `f${i}`, node: <Dupe a={a} b={b} stage={2} /> },
        ]),
        { ms: 3000, node: <Outro line="Fai il furbo su" /> },
      ])
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
  const previewAt: Partial<Record<Format, number>> = { swipe: 0, meme: 0, prezzo: 4, sconto: 2, caro: 4, budget: 1, colore: 5, vetrina: 1, mood: 0, pioggia: 0, stop: 1, mese: 1, tieni: 1, chat: 0, notifiche: 0, scontrino: 0, ruota: 0, slot: 1, cerca: 0, note: 0, furbo: 3 }
  const current = slides[playing ? step : Math.min(previewAt[format] ?? 1, slides.length - 1)]
  const isPost = POSTS.includes(format)

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#000]">
      {/* Il palco: 9:16, grande quanto lo schermo del telefono; 4:5 per i post fermi */}
      <div
        className={`@container relative ${isPost ? 'aspect-[4/5] w-full max-w-[calc(100dvh*4/5)]' : 'h-full max-h-[calc(100vw*16/9)] w-full max-w-[calc(100dvh*9/16)]'} overflow-hidden bg-gradient-to-b from-[#1a0b14] via-[#14080f] to-[#000] text-[#fff]`}
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
            key={`${format}-${variant}-${playing ? (current?.group ?? step) : 'preview'}`}
            // Zona sicura dei Reels/TikTok, valida per tutti i formati: margine a destra (icone) e sotto (nome e didascalia), contenuto centrato in altezza.
            className={`absolute flex flex-col ${isPost ? 'inset-[5%]' : 'top-[15%] right-[12%] bottom-[18%] left-[9%]'}`}
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
        <div className="absolute inset-x-0 bottom-0 z-30 max-h-[70dvh] overflow-y-auto space-y-3 rounded-t-3xl border-t border-[#fff]/15 bg-[#0b0b0d] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(0,0,0,0.8)]">
          <FormatMenu format={format} onPick={setFormat} />
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
            {!isPost && <button type="button" onClick={start} disabled={!slides.length} className="inline-flex items-center gap-1.5 rounded-full bg-[#f43f5e] px-5 py-2 text-sm font-bold text-[#fff] disabled:opacity-40">
              <Play className="size-4 fill-current" /> Avvia
            </button>}
            <a href={routeHref('profilo')} aria-label="Chiudi Studio" className="grid size-9 place-items-center rounded-full bg-[#2a2a30] text-[#fff] ring-1 ring-[#fff]/20">
              <X className="size-5" />
            </a>
          </div>
          <Calendar current={format} onPick={setFormat} />
          {slides.note && <p className="rounded-xl bg-[#facc15]/15 p-2.5 text-xs text-[#fde68a] ring-1 ring-[#facc15]/30">🔒 Solo per te. {slides.note}</p>}
          {slides.caption && <CaptionBox text={slides.caption} label={isPost ? 'X e Threads' : undefined} />}
          {slides.wa && <CaptionBox text={slides.wa} label="Canale WhatsApp (lì si risponde con le reazioni)" />}
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
            {isPost ? 'Tocca l\'immagine per nascondere i comandi, fai uno screenshot e ritaglialo sul riquadro. "Altri" cambia i prodotti.' : <>Avvia la registrazione schermo, poi tocca Avvia. Tocca il video per fermarlo. Tocca l'anteprima per nascondere o mostrare i comandi.</>}
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
    if (!enabled || !hasSupabase || brands) return
    supabaseRpc('admin_insights', { days: 7 }).then(({ data }) => {
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

/** Chat a testi fissi: nessuna persona vera, solo ruoli generici. "product" mette la foto come link. */
interface ChatLine {
  me?: boolean
  text?: string
  product?: boolean
}
const CHATS: { name: string; hook: string; lines: ChatLine[] }[] = [
  {
    name: 'Amica 💅',
    hook: 'Quando ti chiedono dove l\'hai preso',
    lines: [{ text: 'ma dove l\'hai preso?? 😍' }, { me: true, text: 'segreto 🤫' }, { text: 'DAI DIMMELO' }, { me: true, product: true }, { me: true, text: '{marca}, {prezzo}' }, { text: 'sto ordinando 😭😭' }],
  },
  {
    name: 'Mamma ❤️',
    hook: 'Mia madre a Natale',
    lines: [{ text: 'cosa vuoi per Natale?' }, { me: true, product: true }, { text: 'e quanto costa?' }, { me: true, text: 'solo {prezzo} 🙏' }, { text: 'ne parliamo' }, { me: true, text: 'mamma è scontato del {sconto}' }, { text: 'va bene 🙄' }],
  },
  {
    name: 'Lui 🙂',
    hook: 'Quando ti chiede cosa vuoi per il compleanno',
    lines: [{ text: 'cosa ti regalo per il compleanno?' }, { me: true, text: 'niente, non serve 🥺' }, { text: 'sicura?' }, { me: true, product: true }, { me: true, text: 'ma solo se vuoi eh' }, { text: '😂😂 preso' }],
  },
  {
    name: 'Gruppo Amiche 👯',
    hook: 'Il gruppo quando trovo un\'offerta',
    lines: [{ me: true, text: 'RAGAZZE' }, { me: true, product: true }, { text: '-{sconto}?? 😱' }, { text: 'link subito' }, { me: true, text: 'Swipe Shopping 👀' }, { text: 'addio stipendio' }],
  },
  {
    name: 'Banca 🏦',
    hook: 'La mia banca quando apro l\'app',
    lines: [{ text: 'Gentile cliente, notiamo molte spese 🧐' }, { me: true, text: 'ma era in offerta' }, { me: true, product: true }, { text: 'Anche le altre 7?' }, { me: true, text: 'visualizzato ✓✓' }],
  },
]
const CHAT_MS = 1150
function Chat({ name, lines, product }: { name: string; lines: ChatLine[]; product: Product }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (n >= lines.length) return
    const t = setTimeout(() => setN((v) => v + 1), n === 0 ? 500 : CHAT_MS)
    return () => clearTimeout(t)
  }, [n, lines.length])
  const fp = freshPrice(product)!
  const typing = n < lines.length && n > 0 && !lines[n].me
  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-[2rem] bg-[#0b0b0d] ring-1 ring-[#fff]/10">
      <div className="flex flex-col items-center gap-1 border-b border-[#fff]/10 bg-[#1c1c1e] py-3">
        <span className="grid size-11 place-items-center rounded-full bg-gradient-to-b from-[#a1a1aa] to-[#52525b] text-xl font-bold">{[...name][0]}</span>
        <span className="text-sm font-semibold">{name}</span>
      </div>
      <div className="flex flex-1 flex-col justify-end gap-2 p-3">
        {lines.slice(0, n).map((l, k) => (
          <motion.div
            key={k}
            initial={{ scale: 0.6, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 24 }}
            className={`max-w-[78%] ${l.me ? 'origin-bottom-right self-end' : 'origin-bottom-left self-start'}`}
          >
            {l.product ? (
              <div className="w-56 overflow-hidden rounded-2xl bg-[#262629]">
                <ProductImage product={product} eager className="aspect-square w-full" />
                <div className="px-3 py-2">
                  <p className="text-xs font-semibold">{product.brand} · {formatPrice(fp.price)}</p>
                  <p className="text-[11px] text-[#fff]/55">swipeshopping.app</p>
                </div>
              </div>
            ) : (
              <p className={`rounded-[1.2rem] px-3.5 py-2 text-[17px] leading-snug ${l.me ? 'bg-[#0a84ff] text-[#fff]' : 'bg-[#2c2c2e] text-[#fff]'}`}>{l.text}</p>
            )}
          </motion.div>
        ))}
        {typing && (
          <div className="flex w-fit gap-1 rounded-full bg-[#2c2c2e] px-3.5 py-3">
            {[0, 1, 2].map((d) => (
              <motion.span key={d} className="size-2 rounded-full bg-[#fff]/60" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 0.9, delay: d * 0.15 }} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const LOCK_BG = 'linear-gradient(160deg, #4c1d95 0%, #be185d 45%, #f97316 100%)'
const NOTIF_MS = 1300
/** Schermata di blocco con ora e data di adesso; le notifiche entrano dall'alto e si impilano. */
function LockScreen({ items }: { items: Product[] }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (n >= items.length) return
    const t = setTimeout(() => setN((v) => v + 1), n === 0 ? 1200 : NOTIF_MS)
    return () => clearTimeout(t)
  }, [n, items.length])
  const now = new Date()
  const time = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  const date = now.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
  return (
    <div className="flex flex-1 flex-col">
      <div className="text-center">
        <p className="text-lg font-semibold capitalize opacity-90">{date}</p>
        <p className="text-[5.5rem] leading-none font-bold tracking-tight">{time}</p>
      </div>
      <div className="mt-6 flex flex-col gap-2">
        {items.slice(0, n).reverse().map((p) => {
          const fp = freshPrice(p)!
          return (
            <motion.div
              key={p.id}
              initial={{ y: -40, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              className="flex items-center gap-3 rounded-[1.4rem] bg-[#fff]/25 p-3 shadow-lg ring-1 ring-[#fff]/20 backdrop-blur-sm"
            >
              <img src="icons/icon-192.png" alt="" className="size-9 rounded-xl" />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between text-xs font-semibold opacity-80">
                  <span>SWIPE SHOPPING</span>
                  <span>ora</span>
                </div>
                <p className="truncate text-[15px] font-bold">-{fp.discountPct}% su {p.brand} 🔥</p>
                <p className="truncate text-sm opacity-90">
                  {formatPrice(fp.price)} invece di {formatPrice(fp.originalPrice ?? fp.price)}
                </p>
              </div>
              <ProductImage product={p} eager className="size-12 shrink-0 overflow-hidden rounded-lg bg-[#fff]" />
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

const RECEIPT_BG = 'radial-gradient(120% 90% at 50% 0%, #3f3f46 0%, #18181b 70%)'
/** Scontrino di carta: si "stampa" dall'alto, le righe compaiono una dopo l'altra, poi il risparmio. */
function Receipt({ items, full, paid }: { items: Product[]; full: number; paid: number }) {
  const row = (k: number) => ({ initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { delay: 0.8 + k * 0.7 } })
  const after = 0.8 + items.length * 0.7
  return (
    <div className="flex flex-1 flex-col items-center justify-center">
      <motion.div
        initial={{ clipPath: 'inset(0 0 100% 0)' }}
        animate={{ clipPath: 'inset(0 0 0% 0)' }}
        transition={{ duration: after + 1.2, ease: 'linear' }}
        className="w-[92%] bg-[#fafaf9] px-5 pt-5 pb-5 font-mono text-[13px] text-[#1c1917] shadow-[0_30px_60px_rgba(0,0,0,0.6)] [mask-image:linear-gradient(#000_96%,transparent)]"
      >
        <p className="text-center text-xl font-black tracking-widest">SWIPE SHOPPING</p>
        <p className="text-center text-[11px]">la wishlist di oggi · swipeshopping.app</p>
        <div className="my-2.5 border-t-2 border-dashed border-[#a8a29e]" />
        {items.map((p, k) => {
          const fp = freshPrice(p)!
          return (
            <motion.div key={p.id} {...row(k)} className="mb-1.5">
              <div className="flex justify-between gap-2">
                <span className="truncate uppercase">{p.brand}</span>
                <span className="font-bold">{formatPrice(fp.price)}</span>
              </div>
              <p className="truncate text-[11px] text-[#57534e]">
                {p.title.slice(0, 32)} {fp.originalPrice ? `(era ${formatPrice(fp.originalPrice)})` : ''}
              </p>
            </motion.div>
          )
        })}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: after }}>
          <div className="my-2.5 border-t-2 border-dashed border-[#a8a29e]" />
          <div className="flex justify-between">
            <span>PREZZO PIENO</span>
            <span className="line-through">{formatPrice(full)}</span>
          </div>
          <div className="flex justify-between text-lg font-black">
            <span>TOTALE</span>
            <span>{formatPrice(paid)}</span>
          </div>
        </motion.div>
        <motion.p
          initial={{ scale: 2.4, opacity: 0, rotate: -14 }}
          animate={{ scale: 1, opacity: 1, rotate: -8 }}
          transition={{ delay: after + 1, type: 'spring', stiffness: 220, damping: 12 }}
          className="mx-auto mt-5 w-fit rounded-lg border-4 border-[#dc2626] px-3 py-1 text-center text-2xl font-black text-[#dc2626]"
        >
          RISPARMI {formatPrice(full - paid)}
        </motion.p>
        <div className="mx-auto mt-4 h-8 w-3/4 bg-[repeating-linear-gradient(90deg,#1c1917_0_2px,transparent_2px_4px,#1c1917_4px_7px,transparent_7px_9px)]" />
      </motion.div>
    </div>
  )
}

/** Etichetta corta per lo spicchio: prima parola, al massimo 10 lettere. */
const short = (l: string) => {
  const w = l.split(/[ ,]/)[0]
  return w.length > 10 ? `${w.slice(0, 9)}…` : w
}
const WHEEL_COLORS = ['#f43f5e', '#f59e0b', '#10b981', '#6366f1', '#ec4899', '#14b8a6', '#8b5cf6', '#f97316']
/** Ruota a 8 spicchi: gira per 5 secondi rallentando, si ferma sullo spicchio vincente, poi esce il prodotto. */
function Wheel({ labels, win, product }: { labels: string[]; win: number; product: Product }) {
  const [done, setDone] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setDone(true), 5600)
    return () => clearTimeout(t)
  }, [])
  const step = 360 / labels.length
  // Il centro dello spicchio vincente finisce sotto la freccia in alto.
  const end = 360 * 6 - (win * step + step / 2)
  const fp = freshPrice(product)!
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5">
      <p className="text-center text-3xl font-black">{done ? `È uscito: ${labels[win]}!` : 'La ruota decide 🎡'}</p>
      <div className="relative aspect-square w-[88%]">
        <span className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 text-4xl drop-shadow-lg">🔻</span>
        <motion.div
          className="absolute inset-0 rounded-full shadow-[0_0_0_6px_#fff,0_20px_50px_rgba(0,0,0,0.6)]"
          style={{ background: `conic-gradient(${labels.map((_, k) => `${WHEEL_COLORS[k]} ${k * step}deg ${(k + 1) * step}deg`).join(',')})` }}
          initial={{ rotate: 0 }}
          animate={{ rotate: end }}
          transition={{ duration: 5.2, ease: [0.12, 0.6, 0.15, 1] }}
        >
          {labels.map((l, k) => (
            <span
              key={l}
              className="absolute top-1/2 left-1/2 w-1/2 origin-left pl-[20%] text-[14px] font-black text-[#fff] [text-shadow:0_1px_3px_rgba(0,0,0,.5)]"
              style={{ transform: `rotate(${k * step + step / 2 - 90}deg)` }}
            >
              {short(l)}
            </span>
          ))}
          <span className="absolute top-1/2 left-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#fff] text-2xl shadow-lg">⭐</span>
        </motion.div>
        {done && (
          <motion.div
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 15 }}
            className="absolute inset-[8%] overflow-hidden rounded-3xl bg-[#fff] p-2 text-[#111] shadow-2xl"
          >
            <ProductImage product={product} eager className="aspect-[4/3] w-full overflow-hidden rounded-2xl" />
            <p className="mt-1.5 text-center text-xs font-bold tracking-wide uppercase">{product.brand}</p>
            <p className="text-center text-2xl font-black">{formatPrice(fp.price)}</p>
          </motion.div>
        )}
      </div>
    </div>
  )
}

/** Menu dei formati: gruppi in alto, poi le schede del gruppo con icona, nome e a cosa servono. */
function FormatMenu({ format, onPick }: { format: Format; onPick: (f: Format) => void }) {
  const groupOf = (f: Format) => FORMATS.find((x) => x.id === f)!.group
  const [group, setGroup] = useState<Group>(() => groupOf(format))
  // Se il formato cambia dal calendario, si apre il suo gruppo.
  useEffect(() => setGroup(groupOf(format)), [format])
  return (
    <div className="space-y-2.5">
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
        {GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setGroup(g.id)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-bold ${group === g.id ? 'bg-[#f43f5e] text-[#fff]' : 'bg-[#2a2a30] text-[#fff]/85'}`}
          >
            {g.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {FORMATS.filter((f) => f.group === group).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onPick(f.id)}
            className={`flex items-start gap-2.5 rounded-2xl p-2.5 text-left ring-1 transition active:scale-95 ${
              format === f.id ? 'bg-[#fff] text-[#111] ring-[#fff]' : 'bg-[#1c1c21] text-[#fff] ring-[#fff]/12'
            }`}
          >
            <span className="text-2xl leading-none">{f.emoji}</span>
            <span className="min-w-0">
              <span className="block text-sm leading-tight font-bold">{f.label}</span>
              <span className={`mt-0.5 block text-[11px] leading-snug ${format === f.id ? 'text-[#525252]' : 'text-[#fff]/60'}`}>{f.desc}</span>
            </span>
          </button>
        ))}
      </div>
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
      <button type="button" onClick={() => onPick(WEEK_POST[day])} className={`w-full rounded-lg py-1.5 text-xs font-semibold ${current === WEEK_POST[day] ? 'bg-[#fff] text-[#111]' : 'bg-[#2a2a30] text-[#fff]'}`}>
        💬 Su X, Threads e WhatsApp oggi: {label(WEEK_POST[day])}
      </button>
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
function CaptionBox({ text, label }: { text: string; label?: string }) {
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
      {label && <p className="mb-1 text-[11px] font-bold text-[#fff]/60 uppercase">{label}</p>}
      <button type="button" onClick={() => setOpen(!open)} className={`w-full text-left text-xs whitespace-pre-line text-[#fff]/85 ${open ? 'max-h-40 overflow-y-auto' : 'line-clamp-2'}`}>
        {text}
      </button>
      <button type="button" onClick={copy} className="mt-2 w-full rounded-lg bg-[#fff] py-1.5 text-sm font-bold text-[#111] active:scale-95">
        {copied ? 'Copiata ✓' : 'Copia didascalia'}
      </button>
    </div>
  )
}

const SLOT_BG = 'radial-gradient(120% 80% at 50% 30%, #7f1d1d 0%, #1c0606 75%)'
/** Slot machine: i tre rulli girano tra capi a caso e si fermano uno dopo l'altro sui pezzi dell'outfit. */
function Slot({ items, pool, total }: { items: Product[]; pool: Product[]; total: number }) {
  const [stopped, setStopped] = useState(0)
  useEffect(() => {
    const ts = [1700, 2900, 4100].map((ms, k) => setTimeout(() => setStopped(k + 1), ms))
    return () => ts.forEach(clearTimeout)
  }, [])
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5">
      <p className="text-center text-3xl font-black tracking-wide text-[#fde047] [text-shadow:0_0_18px_rgba(253,224,71,.6)]">
        {stopped >= 3 ? 'JACKPOT! 🎉' : '🎰 GIRA… 🎰'}
      </p>
      <div className="w-full rounded-[2rem] bg-[linear-gradient(#facc15,#ca8a04)] p-2.5 shadow-[0_20px_50px_rgba(0,0,0,.6)]">
        <div className="flex flex-col gap-2 rounded-[1.5rem] bg-[#1c0606] p-2.5">
          {items.map((p, k) => {
            const strip = pool.slice(k * 10, k * 10 + 10)
            return (
              <div key={k} className="relative h-[7.5rem] overflow-hidden rounded-2xl bg-[#fff]">
                {stopped <= k ? (
                  // Il rullo: una striscia di foto (ripetuta due volte) che scorre in loop, così le immagini restano caricate.
                  <motion.div
                    className="blur-[1.5px]"
                    animate={{ y: ['0%', '-50%'] }}
                    transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
                  >
                    {[...strip, ...strip].map((q, j) => (
                      <div key={j} className="flex h-[7.5rem] items-center justify-center">
                        <ProductImage product={q} eager className="size-24 overflow-hidden rounded-xl" />
                      </div>
                    ))}
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ y: -30, scale: 1.08 }}
                    animate={{ y: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 14 }}
                    className="flex h-full items-center gap-3 px-3"
                  >
                    <ProductImage product={p} eager className="size-24 shrink-0 overflow-hidden rounded-xl" />
                    <div className="min-w-0 text-[#111]">
                      <p className="truncate text-xs font-bold tracking-wide text-[#dc2626] uppercase">{p.brand}</p>
                      <p className="line-clamp-2 text-sm font-semibold">{p.title}</p>
                      <p className="text-xl font-black">{formatPrice(freshPrice(p)!.price)}</p>
                    </div>
                  </motion.div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex h-14 items-center">
        {stopped >= 3 && (
          <motion.p
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 240, damping: 12 }}
            className="rounded-2xl bg-[#fde047] px-5 py-2 text-2xl font-black text-[#111]"
          >
            Outfit a {formatPrice(total)}
          </motion.p>
        )}
      </div>
    </div>
  )
}

const SEARCH_BG = 'linear-gradient(#f8fafc, #e2e8f0)'
/** Barra di ricerca che si scrive lettera per lettera, poi i risultati veri in lista. */
function Search({ query, results, count }: { query: string; results: Product[]; count: number }) {
  const [typed, setTyped] = useState(0)
  useEffect(() => {
    if (typed >= query.length) return
    const t = setTimeout(() => setTyped((v) => v + 1), typed === 0 ? 600 : 70)
    return () => clearTimeout(t)
  }, [typed, query.length])
  const done = typed >= query.length
  return (
    <div className="flex flex-1 flex-col justify-center gap-4 text-[#0f172a]">
      <p className="text-center text-2xl font-black">
        Swipe<span className="text-[#f43f5e]">Shopping</span>
      </p>
      <div className="flex items-center gap-2 rounded-3xl bg-[#fff] px-4 py-3 shadow-[0_6px_24px_rgba(15,23,42,.15)] ring-1 ring-[#cbd5e1]">
        <span className="text-lg">🔍</span>
        <p className="min-w-0 flex-1 text-[15px] leading-snug font-medium">
          {query.slice(0, typed)}
          {!done && <span className="ml-px inline-block h-4 w-0.5 animate-pulse bg-[#f43f5e] align-middle" />}
        </p>
      </div>
      <div className="min-h-[22rem] space-y-2">
        {done && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="px-1 text-xs text-[#64748b]">
            {count} risultati · prezzi di oggi
          </motion.p>
        )}
        {done &&
          results.map((p, k) => {
            const fp = freshPrice(p)!
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 + k * 0.6, type: 'spring', stiffness: 220, damping: 22 }}
                className="flex items-center gap-3 rounded-2xl bg-[#fff] p-2 shadow-sm"
              >
                <ProductImage product={p} eager className="size-16 shrink-0 overflow-hidden rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-bold tracking-wide text-[#f43f5e] uppercase">{p.brand}</p>
                  <p className="truncate text-sm font-medium">{p.title}</p>
                  <p className="text-lg font-black">
                    {formatPrice(fp.price)}
                    {fp.discountPct ? <span className="ml-2 rounded-md bg-[#dcfce7] px-1.5 text-xs font-bold text-[#15803d]">-{fp.discountPct}%</span> : null}
                  </p>
                </div>
              </motion.div>
            )
          })}
      </div>
    </div>
  )
}

/** Note del telefono: titolo, propositi che si cancellano, ultima riga = il prodotto. Testi fissi. */
const NOTES: { title: string; lines: string[]; end: string }[] = [
  { title: 'Obiettivi di {mese}', lines: ['Risparmiare 💶', 'Basta shopping online', 'Comprare solo il necessario'], end: '{marca} a {prezzo} (necessario)' },
  { title: 'Lista della spesa 🛒', lines: ['Latte', 'Pane', 'Uova', 'Frutta'], end: '{marca} a -{sconto}% (era in offerta, non potevo)' },
  { title: 'Budget di {mese} 💶', lines: ['Affitto', 'Bollette', 'Spesa', 'Risparmi'], end: '{marca}, {prezzo}. I risparmi possono aspettare' },
  { title: 'Cose che mi servono davvero', lines: ['Niente', 'Proprio niente', 'Giuro, niente'], end: 'Questo 👇 a {prezzo}' },
  { title: 'Buoni propositi 2.0 ✨', lines: ['Niente carrello pieno', 'Niente "lo metto nei preferiti"', 'Niente acquisti di notte'], end: 'Ore 2:14 · {marca} -{sconto}% ✅' },
]
const NOTE_MS = 1000
const NOTES_BG = 'linear-gradient(#fef9c3, #fef3c7)'
function Notes({ title, lines, end, product }: { title: string; lines: string[]; end: string; product: Product }) {
  // Ogni riga compare e poco dopo viene barrata; poi arriva l'ultima con il prodotto.
  const [n, setN] = useState(0)
  useEffect(() => {
    if (n > lines.length * 2) return
    const t = setTimeout(() => setN((v) => v + 1), n === 0 ? 700 : NOTE_MS / 2)
    return () => clearTimeout(t)
  }, [n, lines.length])
  const showEnd = n > lines.length * 2
  return (
    <div className="flex flex-1 flex-col justify-center text-[#292524]">
      <p className="mb-1 text-sm font-semibold text-[#ca8a04]">‹ Note</p>
      <p className="mb-4 text-3xl leading-tight font-black">{title}</p>
      <div className="space-y-3 text-xl">
        {lines.map((l, k) => {
          const visible = n > k * 2
          const struck = n > k * 2 + 1
          if (!visible) return null
          return (
            <motion.p key={l} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} className="relative w-fit">
              <span className={struck ? 'text-[#a8a29e]' : ''}>• {l}</span>
              <motion.span
                initial={{ scaleX: 0 }}
                animate={{ scaleX: struck ? 1 : 0 }}
                transition={{ duration: 0.25 }}
                className="absolute top-1/2 right-0 left-0 h-[3px] origin-left rounded bg-[#dc2626]"
              />
            </motion.p>
          )
        })}
      </div>
      <div className="mt-5 min-h-[9rem]">
        {showEnd && (
          <motion.div initial={{ opacity: 0, y: 16, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 16 }}>
            <p className="text-xl font-bold">✅ {end}</p>
            <div className="mt-3 flex items-center gap-3 rounded-2xl bg-[#fff] p-2 shadow-md">
              <ProductImage product={product} eager className="size-20 shrink-0 overflow-hidden rounded-xl" />
              <div className="min-w-0">
                <p className="truncate text-xs font-bold tracking-wide text-[#f43f5e] uppercase">{product.brand}</p>
                <p className="line-clamp-2 text-sm">{product.title}</p>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}

/** Il caro (sopra) e il furbo (sotto): stage 0 solo il caro, 1 arriva il furbo, 2 quanto si risparmia. */
function Dupe({ a, b, stage }: { a: Product; b: Product; stage: number }) {
  const pa = freshPrice(a)!.price
  const pb = freshPrice(b)!.price
  const half = (p: Product, price: number, label: string, furbo: boolean) => (
    <div className={`flex items-center gap-3 rounded-3xl p-3 ${furbo ? 'bg-[#16a34a]' : 'bg-[#fff]/10'}`}>
      <ProductImage product={p} eager className="size-32 shrink-0 overflow-hidden rounded-2xl" />
      <div className="min-w-0">
        <p className="text-sm font-black tracking-widest uppercase">{label}</p>
        <p className={`truncate text-xs font-bold tracking-wide uppercase ${furbo ? 'text-[#dcfce7]' : 'text-[#fb7185]'}`}>{p.brand}</p>
        <p className="line-clamp-2 text-xs opacity-90">{p.title}</p>
        <p className="mt-1 text-3xl font-black">{formatPrice(price)}</p>
      </div>
    </div>
  )
  return (
    <div className="flex flex-1 flex-col justify-center gap-3">
      {half(a, pa, 'Il caro 💸', false)}
      <div className="flex h-10 items-center justify-center text-2xl font-black">{stage >= 1 ? 'VS' : ''}</div>
      <div className="min-h-[9.5rem]">
        {stage >= 1 && (
          <motion.div initial={{ x: 120, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 20 }}>
            {half(b, pb, 'Il furbo 🦊', true)}
          </motion.div>
        )}
      </div>
      <div className="flex h-16 items-center justify-center">
        {stage >= 2 && (
          <motion.p
            initial={{ scale: 2.2, opacity: 0, rotate: -10 }}
            animate={{ scale: 1, opacity: 1, rotate: -4 }}
            transition={{ type: 'spring', stiffness: 220, damping: 12 }}
            className="rounded-2xl border-4 border-[#4ade80] px-4 py-1 text-2xl font-black text-[#4ade80]"
          >
            -{formatPrice(pa - pb)} in tasca
          </motion.p>
        )}
      </div>
    </div>
  )
}

/** Post fermo 4:5: titolo in alto, contenuto, firma in basso (l'immagine gira da sola, senza didascalia). */
function PostFrame({ kicker, title, sub, children }: { kicker: string; title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-[3cqw]">
      <div className="text-center">
        <p className="text-[3.4cqw] font-bold tracking-[0.25em] text-[#fb7185] uppercase">{kicker}</p>
        <h1 className="mt-[1cqw] text-[8.5cqw] leading-none font-black tracking-tight">{title}</h1>
        {sub && <p className="mt-[1.2cqw] text-[4cqw] text-[#fff]/75">{sub}</p>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-center">{children}</div>
      <div className="flex items-center justify-between text-[3.4cqw] text-[#fff]/70">
        <Logo className="!text-[4.6cqw]" />
        <span className="font-semibold">swipeshopping.app</span>
      </div>
    </div>
  )
}

function PostTile({ product, label, price }: { product: Product; label: string; price?: boolean }) {
  return (
    <div className="relative">
      <ProductImage product={product} eager className="aspect-square w-full overflow-hidden rounded-[3cqw]" />
      <span className="absolute top-[1.6cqw] left-[1.6cqw] grid size-[9cqw] place-items-center rounded-full bg-[#fff] text-[5cqw] font-black text-[#111] shadow-lg">{label}</span>
      {price && (
        <span className="absolute right-[1.6cqw] bottom-[1.6cqw] rounded-full bg-[#000]/80 px-[2cqw] py-[0.6cqw] text-[3.6cqw] font-bold">{formatPrice(freshPrice(product)!.price)}</span>
      )}
    </div>
  )
}

function PostGrid({ kicker, title, sub, items, labels, prices }: { kicker: string; title: string; sub?: string; items: Product[]; labels: string[]; prices?: boolean }) {
  return (
    <PostFrame kicker={kicker} title={title} sub={sub}>
      <div className="mx-auto grid w-[76%] grid-cols-2 gap-[2.4cqw]">
        {items.map((p, i) => <PostTile key={p.id} product={p} label={labels[i]} price={prices} />)}
      </div>
    </PostFrame>
  )
}

function PostGuess({ product, options }: { product: Product; options: number[] }) {
  return (
    <PostFrame kicker={product.brand ?? categoryLabel(product.category as CategoryId)} title="QUANTO COSTA?">
      <ProductImage product={product} eager className="mx-auto aspect-square w-[62%] overflow-hidden rounded-[4cqw]" />
      <div className="mt-[3cqw] grid grid-cols-3 gap-[2cqw]">
        {options.map((o, i) => (
          <div key={o} className="rounded-[3cqw] bg-[#fff]/10 py-[2cqw] text-center ring-1 ring-[#fff]/25">
            <p className="text-[4cqw] font-black text-[#fb7185]">{'ABC'[i]}</p>
            <p className="text-[5cqw] font-black">{formatPrice(o)}</p>
          </div>
        ))}
      </div>
    </PostFrame>
  )
}

function PostVote({ product }: { product: Product }) {
  return (
    <PostFrame kicker={`${product.brand} · ${formatPrice(freshPrice(product)!.price)}`} title="VOTO DA 1 A 10?">
      <ProductImage product={product} eager className="mx-auto aspect-square w-[70%] overflow-hidden rounded-[4cqw]" />
      <div className="mt-[3.5cqw] flex justify-center gap-[1.2cqw]">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className="grid size-[7cqw] place-items-center rounded-full bg-[#fff]/12 text-[3.6cqw] font-bold ring-1 ring-[#fff]/25">{i + 1}</span>
        ))}
      </div>
    </PostFrame>
  )
}

function PostMissing({ items, what, gender }: { items: Product[]; what: string; gender: string }) {
  return (
    <PostFrame kicker={`Outfit da ${gender}`} title="COMPLETA L'OUTFIT" sub={`Manca: ${what.toLowerCase()}`}>
      <div className="mx-auto grid w-[76%] grid-cols-2 gap-[2.4cqw]">
        {items.map((p) => <ProductImage key={p.id} product={p} eager className="aspect-square w-full overflow-hidden rounded-[3cqw]" />)}
        <div className="grid aspect-square place-items-center rounded-[3cqw] border-[0.8cqw] border-dashed border-[#fff]/50 bg-[#fff]/5">
          <span className="text-[18cqw] leading-none font-black text-[#fb7185]">?</span>
        </div>
      </div>
    </PostFrame>
  )
}

function PostQuestion({ kicker, text, a, b }: { kicker: string; text: string; a?: string; b?: string }) {
  return (
    <PostFrame kicker={kicker} title="">
      <p className="px-[3cqw] text-center text-[9cqw] leading-[1.1] font-black tracking-tight">{text}</p>
      {a && b && (
        <div className="mt-[6cqw] grid grid-cols-2 gap-[3cqw] px-[3cqw]">
          {[a, b].map((t, i) => (
            <div key={t} className={`rounded-[4cqw] py-[3.5cqw] text-center text-[5.5cqw] font-black ${i ? 'bg-[#6366f1]' : 'bg-[#f43f5e]'}`}>{t}</div>
          ))}
        </div>
      )}
      <p className="mt-[6cqw] text-center text-[4.4cqw] text-[#fff]/75">Dimmi la tua 👇</p>
    </PostFrame>
  )
}

function PostPair({ kicker, items }: { kicker: string; items: Product[] }) {
  return (
    <PostFrame kicker={kicker} title="A O B?">
      <div className="grid grid-cols-2 gap-[2.4cqw]">
        {items.map((p, i) => (
          <div key={p.id} className="space-y-[1.6cqw]">
            <PostTile product={p} label={'AB'[i]} />
            <p className="text-center text-[4cqw] font-bold">{formatPrice(freshPrice(p)!.price)}</p>
          </div>
        ))}
      </div>
    </PostFrame>
  )
}

function PostBrand({ product, options }: { product: Product; options: string[] }) {
  return (
    <PostFrame kicker={categoryLabel(product.category as CategoryId)} title="DI CHE MARCA È?">
      <ProductImage product={product} eager className="mx-auto aspect-square w-[54%] overflow-hidden rounded-[4cqw]" />
      <div className="mt-[3cqw] space-y-[1.6cqw]">
        {options.map((o, i) => (
          <div key={o} className="flex items-center gap-[2.4cqw] rounded-[3cqw] bg-[#fff]/10 px-[3cqw] py-[1.6cqw] ring-1 ring-[#fff]/25">
            <span className="text-[4.4cqw] font-black text-[#fb7185]">{'ABC'[i]}</span>
            <span className="truncate text-[4.6cqw] font-bold">{o}</span>
          </div>
        ))}
      </div>
    </PostFrame>
  )
}
