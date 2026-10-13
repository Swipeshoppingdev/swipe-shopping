import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDown, ArrowUp, ArrowUpDown, BadgeCheck, Disc3, Footprints, Check, Euro, Heart, Percent, Shuffle, Sparkles, Tag, TrendingUp, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { categoryLabel, universeOf, type CategoryId } from '../config/categories'
import { OUTFITS_SAVED_EVENT } from './CompleteLook'
import { STYLE_LABEL, completeLook, outfitId, swapOptions, type Outfit } from '../lib/outfits'
import { brandAndStore } from '../config/stores'
import { setBoost, spendBoost } from '../lib/boost'
import { formatPrice, freshPrice } from '../lib/price'
import { load, save } from '../lib/storage'
import { CLOSE_BREAKS_EVENT } from '../lib/closeBreaks'
import { decoys } from '../lib/priceGame'
import { useApp } from '../state/AppState'
import type { Product } from '../types/product'
import { DuelView, pickPair } from './DuelView'
import { ProductImage } from './ProductImage'
import { StoreLink } from './StoreLink'
import { ChallengeStarter } from './ChallengeStarter'
import { FEATURES } from '../config/app'
import { useAuth } from '../state/AuthState'

/** Ogni quanti swipe arriva una pausa di gioco. */
const EVERY = 10
/** Rotazione: Indovina il prezzo e Cosa ti va (i preferiti) tornano più spesso. */
const NO_LOGO = new Set(['scarpe_eleganti', 'stivali', 'camicie', 'cappotti', 'vestiti', 'maglioni', 'giacche', 'pantaloni'])
const KINDS = ['prezzo', 'ruota', 'scelta', 'mistero', 'piumeno', 'ordina', 'gratta', 'pezzo', 'prezzo', 'scelta', 'ruota', 'caro', 'mistero', 'piumeno', 'marca', 'ordina', 'gratta', 'pezzo', 'duello'] as const
const SHOES = ['sneakers', 'scarpe_eleganti', 'stivali', 'scarpe_sportive', 'sandali']
type Break =
  | { kind: 'duello'; pair: [Product, Product] }
  | { kind: 'caro'; pair: [Product, Product] }
  | { kind: 'piumeno'; chain: Product[] }
  | { kind: 'gratta'; product: Product }
  | { kind: 'mistero'; product: Product }
  | { kind: 'ordina'; products: Product[] }
  | { kind: 'ruota'; options: { category: string; product: Product }[] }
  | { kind: 'pezzo'; outfit: Outfit; missing: number; options: Product[] }
  | { kind: 'marca'; product: Product; options: string[] }
  | { kind: 'prezzo'; product: Product; options: number[]; price: number }
  | { kind: 'scelta'; options: { category: string; product: Product }[] }

/**
 * Il prodotto "sembra" della sua categoria: il titolo contiene una parola del nome della categoria
 * (Monitor → "monitor"). Evita foto sbagliate nei giochi quando Amazon classifica male un prodotto.
 */
const STOP = new Set(['della', 'delle', 'degli', 'per', 'cura', 'piccoli', 'oggetti', 'gadget', 'accessori'])
const stems = new Map<string, string[]>()
function looksLike(p: Product) {
  let st = stems.get(p.category)
  if (!st) {
    st = categoryLabel(p.category as CategoryId)
      .toLowerCase()
      .split(/[^a-zàèéìòù]+/)
      .filter((w) => w.length > 4 && !STOP.has(w))
      .map((w) => w.slice(0, -1))
    stems.set(p.category, st)
  }
  const t = p.title.toLowerCase()
  return st.some((w) => t.includes(w))
}

function buildBreak(kind: (typeof KINDS)[number], deck: Product[], all: Product[], gender: 'uomo' | 'donna'): Break | null {
  if (kind === 'ordina') {
    // 4 prodotti con prezzi aggiornati, tutti ben distanti tra loro (almeno 15%).
    const picked: Product[] = []
    for (const p of deck.slice(1, 120)) {
      const fp = freshPrice(p)
      if (!fp || fp.from) continue
      if (picked.some((q) => Math.max(fp.price, freshPrice(q)!.price) < Math.min(fp.price, freshPrice(q)!.price) * 1.15)) continue
      picked.push(p)
      if (picked.length === 4) return { kind, products: picked }
    }
    return null
  }
  if (kind === 'ruota') {
    // Da 6 a 3 fette: con filtri stretti (es. solo scarpe) le categorie nel mazzo sono poche.
    for (const n of [6, 5, 4, 3]) {
      const cats = categoryOptions(deck, n, 2)
      if (cats) return { kind, options: cats }
    }
    return null
  }
  if (kind === 'pezzo') {
    // Solo Moda: un outfit vero costruito attorno a un capo del mazzo, con un pezzo (meglio le scarpe) da scegliere.
    for (const base of deck.slice(1, 40)) {
      if (universeOf(base.category) !== 'moda' || SHOES.includes(base.category)) continue
      const g = base.gender === 'uomo' || base.gender === 'donna' ? base.gender : gender
      const outfit = completeLook(base, all, g)
      if (!outfit || outfit.items.length < 3) continue
      let missing = outfit.items.findIndex((p) => SHOES.includes(p.category))
      if (missing < 0) missing = outfit.items.length - 1
      const alts = swapOptions(outfit, missing, all).slice(0, 2)
      if (alts.length < 2) continue
      return { kind, outfit, missing, options: [outfit.items[missing], ...alts].sort(() => Math.random() - 0.5) }
    }
    return null
  }
  if (kind === 'duello') {
    const pair = pickPair(deck)
    return pair && { kind, pair }
  }
  if (kind === 'caro') {
    // Due prodotti della stessa categoria con prezzi aggiornati e ben diversi (almeno il 25%).
    const list = deck.slice(1, 80).filter((p) => freshPrice(p) && !p.priceFrom && looksLike(p))
    for (const a of list)
      for (const b of list) {
        if (a === b || a.category !== b.category || a.gender !== b.gender || a.brand === b.brand) continue
        const pa = freshPrice(a)!.price, pb = freshPrice(b)!.price
        if (Math.max(pa, pb) >= Math.min(pa, pb) * 1.25) return { kind, pair: [a, b] }
      }
    return null
  }
  if (kind === 'piumeno') {
    // Una catena di prodotti con prezzi aggiornati, ognuno almeno 10% diverso dal precedente.
    const chain: Product[] = []
    for (const p of deck.slice(1, 120)) {
      const fp = freshPrice(p)
      if (!fp || fp.from) continue
      const prev = chain.at(-1)
      if (prev) {
        const a = freshPrice(prev)!.price
        if (Math.max(a, fp.price) < Math.min(a, fp.price) * 1.1) continue
      }
      chain.push(p)
      if (chain.length === 12) break
    }
    return chain.length >= 6 ? { kind, chain } : null
  }
  if (kind === 'gratta') {
    const product = deck.slice(1, 80).find((p) => {
      const fp = freshPrice(p)
      return fp && !fp.from && (fp.discountPct ?? 0) >= 15
    })
    return product ? { kind, product } : null
  }
  if (kind === 'mistero') {
    // Il più scontato tra i prossimi del mazzo (sconto vero di oggi, almeno 25%).
    let best: Product | null = null
    let bestPct = 24
    for (const p of deck.slice(1, 200)) {
      const fp = freshPrice(p)
      if (fp && !fp.from && (fp.discountPct ?? 0) > bestPct) {
        best = p
        bestPct = fp.discountPct!
      }
    }
    return best ? { kind, product: best } : null
  }
  if (kind === 'marca') {
    // Solo capi dove il logo di solito non si vede in foto (sneakers, borse e tech lo mostrano quasi sempre).
    const withBrand = deck.slice(1, 120).filter((p) => p.brand && NO_LOGO.has(p.category))
    const product = withBrand[0]
    if (!product) return null
    const others = [...new Set(withBrand.map((p) => p.brand!).filter((b) => b.toLowerCase() !== product.brand!.toLowerCase()))]
    if (others.length < 2) return null
    const options = [product.brand!, ...others.sort(() => Math.random() - 0.5).slice(0, 2)].sort(() => Math.random() - 0.5)
    return { kind, product, options }
  }
  if (kind === 'prezzo') {
    const product = deck.slice(1, 30).find((p) => freshPrice(p) && !p.priceFrom)
    const price = product && freshPrice(product)!.price
    if (!product || !price) return null
    const d = decoys(price)
    if (d.length < 2) return null
    return { kind, product, price, options: [price, ...d].sort(() => Math.random() - 0.5) }
  }
  const options = categoryOptions(deck, 4)
  return options && { kind: 'scelta', options }
}

/** n categorie con abbastanza prodotti "veri" nel mazzo, ognuna con un prodotto da mostrare. */
function categoryOptions(deck: Product[], n: number, min = 4) {
  const counts = new Map<string, Product[]>()
  for (const p of deck.slice(1, 300)) if (looksLike(p)) counts.set(p.category, [...(counts.get(p.category) ?? []), p])
  const cats = [...counts].filter(([, l]) => l.length >= min).sort(() => Math.random() - 0.5).slice(0, n)
  return cats.length < n ? null : cats.map(([category, l]) => ({ category, product: l[0] }))
}

/**
 * Pause di gioco nel mazzo, ogni 10 swipe, a rotazione: Indovina il prezzo, Cosa ti va, Più o meno, Gratta lo sconto,
 * Ordina per prezzo, Ruota della fortuna, Il pezzo che manca (solo Moda), Più caro, Indovina la marca, Duello.
 * Spezzano la ripetizione dello swipe; si possono sempre saltare.
 */
export function Breaks() {
  const { state, deck, allProducts } = useApp()
  const swipes = state.swipes
  const last = useRef(swipes)
  const [current, setCurrent] = useState<Break | null>(null)
  // Mazzo e gioco aperto letti al momento dello swipe: il mazzo si ricalcola spesso (sincronizzazione,
  // offerte, boost) e prima ogni ricalcolo annullava il gioco appena programmato, che così si perdeva.
  const deckRef = useRef(deck)
  deckRef.current = deck
  const allRef = useRef(allProducts)
  allRef.current = allProducts
  const gender = state.filters.gender === 'uomo' ? 'uomo' : 'donna'
  const genderRef = useRef<'uomo' | 'donna'>(gender)
  genderRef.current = gender
  const openRef = useRef(false)
  openRef.current = current !== null
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  // Menu Sezioni, cambio di sezione o di pagina: il gioco si chiude (e quello in arrivo non parte).
  useEffect(() => {
    const close = () => {
      clearTimeout(timer.current)
      timer.current = undefined
      setCurrent(null)
    }
    window.addEventListener(CLOSE_BREAKS_EVENT, close)
    window.addEventListener('hashchange', close)
    return () => {
      window.removeEventListener(CLOSE_BREAKS_EVENT, close)
      window.removeEventListener('hashchange', close)
    }
  }, [])
  const modeRef = useRef(state.mode)
  useEffect(() => {
    if (modeRef.current === state.mode) return
    modeRef.current = state.mode
    clearTimeout(timer.current)
    timer.current = undefined
    setCurrent(null)
  }, [state.mode])

  useEffect(() => {
    const added = swipes - last.current
    last.current = swipes
    if (added <= 0) return
    spendBoost(added)
    if (openRef.current || timer.current || load<boolean>('gamesOff', false)) return
    const next = load<number>('breakCount', 0) + added
    save('breakCount', next)
    if (next < EVERY) return
    const start = load<number>('breakKind', 0)
    for (let i = 0; i < KINDS.length; i++) {
      const b = buildBreak(KINDS[(start + i) % KINDS.length], deckRef.current, allRef.current, genderRef.current)
      if (!b) continue
      save('breakKind', (start + i + 1) % KINDS.length)
      // Dopo l'uscita della carta; il conteggio riparte solo quando il gioco compare davvero.
      timer.current = setTimeout(() => {
        timer.current = undefined
        save('breakCount', 0)
        setCurrent(b)
      }, 450)
      return
    }
  }, [swipes])

  const done = () => setCurrent(null)
  return (
    <AnimatePresence>
      {current?.kind === 'duello' && <DuelView key="d" pair={current.pair} onDone={done} />}
      {current?.kind === 'prezzo' && <PriceGuess key="p" {...current} onDone={done} />}
      {current?.kind === 'caro' && <WhichCostsMore key="c" pair={current.pair} onDone={done} />}
      {current?.kind === 'marca' && <BrandGuess key="m" product={current.product} options={current.options} onDone={done} />}
      {current?.kind === 'piumeno' && <HigherLower key="h" chain={current.chain} onDone={done} />}
      {current?.kind === 'gratta' && <ScratchDeal key="g" product={current.product} onDone={done} />}
      {current?.kind === 'mistero' && <MysteryCard key="x" product={current.product} onDone={done} />}
      {current?.kind === 'ordina' && <SortByPrice key="o" products={current.products} onDone={done} />}
      {current?.kind === 'ruota' && <Wheel key="r" options={current.options} onDone={done} />}
      {current?.kind === 'pezzo' && <MissingPiece key="z" {...current} onDone={done} />}
      {current?.kind === 'scelta' && <ThisOrThat key="s" options={current.options} onDone={done} />}
    </AnimatePresence>
  )
}

// game-frame: nel tema chiaro ogni gioco ha il suo sfondo colorato (vedi index.css).
const frame = 'game-frame absolute inset-0 z-30 flex flex-col gap-3 rounded-3xl bg-neutral-50 p-1'
const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }

/** Indovina il prezzo: tre prezzi, uno è quello vero. Poi "Lo voglio" o "Avanti". */
function PriceGuess({ product, price, options, onDone }: { product: Product; price: number; options: number[]; onDone: () => void }) {
  const { actions } = useApp()
  const { user } = useAuth()
  const [picked, setPicked] = useState<number | null>(null)
  const [challenge, setChallenge] = useState(false)
  const right = picked === price
  return (
    <motion.div {...fade} className={frame} role="dialog" aria-label="Indovina il prezzo" data-break>
      <div className="pt-1 text-center">
        <p className="flex items-center justify-center gap-2 text-xl font-black">
          <Tag className="size-5 text-rose-500" /> Indovina il prezzo
        </p>
        <p className="text-sm text-neutral-500">Quanto costa adesso su {brandAndStore(product).split(' · ').pop()}?</p>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-[#fff] shadow-md">
        <ProductImage product={product} eager className="absolute inset-0 size-full object-contain p-3" />
      </div>
      <p className="line-clamp-2 px-2 text-center text-sm font-medium">{product.title}</p>
      <div className="grid grid-cols-3 gap-2 px-1">
        {options.map((o) => {
          const isReal = o === price
          const state = picked === null ? 'idle' : isReal ? 'right' : picked === o ? 'wrong' : 'off'
          return (
            <motion.button
              key={o}
              type="button"
              disabled={picked !== null}
              onClick={() => {
                setPicked(o)
                navigator.vibrate?.(isReal ? [10, 40, 10] : 30)
              }}
              animate={state === 'wrong' ? { x: [0, -6, 6, -4, 4, 0] } : state === 'right' ? { scale: [1, 1.08, 1] } : {}}
              className={`flex h-12 items-center justify-center gap-1 rounded-2xl text-base font-bold ring-1 transition ${
                state === 'right'
                  ? 'bg-emerald-500 text-[#fff] ring-emerald-500'
                  : state === 'wrong'
                    ? 'bg-neutral-200 text-neutral-400 line-through ring-neutral-200'
                    : state === 'off'
                      ? 'bg-white text-neutral-300 ring-neutral-200'
                      : 'bg-white text-neutral-900 ring-neutral-200 active:scale-95'
              }`}
            >
              {state === 'right' && <Check className="size-4" />}
              {state === 'wrong' && <X className="size-4" />}
              {formatPrice(o)}
            </motion.button>
          )
        })}
      </div>
      <p className="h-5 text-center text-sm font-semibold">
        {picked === null ? '' : right ? '🎯 Esatto! Occhio da intenditore' : `Quasi! Costa ${formatPrice(price)}`}
      </p>
      {picked !== null && user && FEATURES.social && (
        <button type="button" onClick={() => setChallenge(true)} className="mx-auto -my-1 text-sm font-bold text-rose-500 underline">
          🎯 Sfida un amico sui prezzi
        </button>
      )}
      {challenge && <ChallengeStarter onClose={() => setChallenge(false)} />}
      <div className="flex justify-center gap-2 pb-1">
        {picked !== null && (
          <button
            type="button"
            onClick={() => {
              actions.like(product)
              onDone()
            }}
            className="flex h-11 items-center gap-2 rounded-full bg-rose-500 px-5 text-sm font-semibold text-[#fff] active:scale-95"
          >
            <Heart className="size-4 fill-current" /> Lo voglio
          </button>
        )}
        <button type="button" onClick={onDone} className="h-11 rounded-full px-5 text-sm font-semibold text-neutral-500 active:bg-neutral-100">
          {picked === null ? 'Salta' : 'Avanti'}
        </button>
      </div>
    </motion.div>
  )
}

/** Cosa ti va: "Cosa vuoi vedere adesso?". La categoria scelta passa in cima al mazzo per 15 swipe. */
function ThisOrThat({ options, onDone }: { options: { category: string; product: Product }[]; onDone: () => void }) {
  const { state } = useApp()
  const [chosen, setChosen] = useState<string | null>(null)
  const label = (c: string) => categoryLabel(c as CategoryId)
  return (
    <motion.div {...fade} className={frame} role="dialog" aria-label="Cosa ti va" data-break>
      <div className="pt-1 text-center">
        <p className="flex items-center justify-center gap-2 text-xl font-black">
          <Shuffle className="size-5 text-rose-500" /> Cosa ti va?
        </p>
        <p className="text-sm text-neutral-500">Scegli cosa vedere nei prossimi swipe</p>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-2">
        {options.map((o, i) => {
          const on = chosen === o.category
          return (
            <motion.button
              key={o.category}
              type="button"
              initial={{ y: i < 2 ? -30 : 30, opacity: 0 }}
              animate={{ y: 0, opacity: chosen && !on ? 0.35 : 1, scale: on ? 1.03 : 1 }}
              onClick={() => {
                if (chosen) return
                setChosen(o.category)
                setBoost({ section: state.mode, category: o.category, left: 15 })
                navigator.vibrate?.(15)
                setTimeout(onDone, 900)
              }}
              className={`relative flex min-h-0 flex-col overflow-hidden rounded-2xl bg-white p-2 text-center shadow-md ring-2 ${on ? 'ring-rose-500' : 'ring-transparent'}`}
            >
              <div className="relative min-h-0 w-full flex-1 bg-[#fff]">
                <ProductImage product={o.product} eager className="absolute inset-0 size-full object-contain" />
              </div>
              <span className="pt-1 text-base leading-tight font-black">{label(o.category)}</span>
            </motion.button>
          )
        })}
      </div>
      <p className="h-5 text-center text-sm font-semibold text-rose-500">
        {chosen ? `Ecco i prossimi: ${label(chosen).toLowerCase()} per te` : ''}
      </p>
      <button type="button" onClick={onDone} className="mx-auto mb-1 h-10 rounded-full px-5 text-sm font-semibold text-neutral-500 active:bg-neutral-100">
        Va bene tutto, salta
      </button>
    </motion.div>
  )
}

/** Più caro? Due prodotti simili: tocca quello che costa di più. Poi si vedono i prezzi veri. */
function WhichCostsMore({ pair, onDone }: { pair: [Product, Product]; onDone: () => void }) {
  const { actions } = useApp()
  const [picked, setPicked] = useState<Product | null>(null)
  const price = (p: Product) => freshPrice(p)!.price
  const dearer = price(pair[0]) > price(pair[1]) ? pair[0] : pair[1]
  return (
    <motion.div {...fade} className={frame} role="dialog" aria-label="Più caro" data-break>
      <div className="pt-1 text-center">
        <p className="flex items-center justify-center gap-2 text-xl font-black">
          <Euro className="size-5 text-rose-500" /> Quale costa di più?
        </p>
        <p className="text-sm text-neutral-500">Fidati dell'occhio: tocca il più caro</p>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
        {pair.map((p) => {
          const st = picked === null ? 'idle' : p === dearer ? 'right' : picked === p ? 'wrong' : 'off'
          return (
            <motion.button
              key={p.id}
              type="button"
              disabled={picked !== null}
              onClick={() => {
                setPicked(p)
                navigator.vibrate?.(p === dearer ? [10, 40, 10] : 30)
              }}
              animate={st === 'wrong' ? { x: [0, -6, 6, -4, 4, 0] } : st === 'right' ? { scale: [1, 1.04, 1] } : {}}
              className={`relative flex min-h-0 flex-col overflow-hidden rounded-2xl bg-white text-left shadow-md ring-2 ${
                st === 'right' ? 'ring-emerald-500' : st === 'wrong' ? 'ring-neutral-300' : 'ring-transparent'
              }`}
            >
              <div className="relative min-h-0 flex-1 bg-[#fff]">
                <ProductImage product={p} eager className="absolute inset-0 size-full object-contain p-2" />
              </div>
              <div className="space-y-0.5 p-2">
                <p className="line-clamp-2 text-xs font-medium">{p.title}</p>
                <p className={`h-6 text-lg font-black ${st === 'right' ? 'text-emerald-600' : ''}`}>{picked ? formatPrice(price(p)) : '?'}</p>
              </div>
            </motion.button>
          )
        })}
      </div>
      <p className="h-5 text-center text-sm font-semibold">
        {picked === null ? '' : picked === dearer ? '💸 Giusto! Hai il fiuto per i prezzi' : 'Eh no! È l\'altro il più caro'}
      </p>
      <div className="flex justify-center gap-2 pb-1">
        {picked !== null && (
          <button
            type="button"
            onClick={() => {
              actions.like(dearer)
              onDone()
            }}
            className="flex h-11 items-center gap-2 rounded-full bg-rose-500 px-5 text-sm font-semibold text-[#fff] active:scale-95"
          >
            <Heart className="size-4 fill-current" /> Salva il più caro
          </button>
        )}
        <button type="button" onClick={onDone} className="h-11 rounded-full px-5 text-sm font-semibold text-neutral-500 active:bg-neutral-100">
          {picked === null ? 'Salta' : 'Avanti'}
        </button>
      </div>
    </motion.div>
  )
}

/** Indovina la marca: una foto e tre marche, una è quella giusta. */
function BrandGuess({ product, options, onDone }: { product: Product; options: string[]; onDone: () => void }) {
  const { actions } = useApp()
  const [picked, setPicked] = useState<string | null>(null)
  const real = product.brand!
  return (
    <motion.div {...fade} className={frame} role="dialog" aria-label="Indovina la marca" data-break>
      <div className="pt-1 text-center">
        <p className="flex items-center justify-center gap-2 text-xl font-black">
          <BadgeCheck className="size-5 text-rose-500" /> Indovina la marca
        </p>
        <p className="text-sm text-neutral-500">Di chi è questo?</p>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-[#fff] shadow-md">
        <ProductImage product={product} eager className="absolute inset-0 size-full object-contain p-3" />
      </div>
      <div className="grid gap-2 px-1">
        {options.map((o) => {
          const isReal = o === real
          const st = picked === null ? 'idle' : isReal ? 'right' : picked === o ? 'wrong' : 'off'
          return (
            <motion.button
              key={o}
              type="button"
              disabled={picked !== null}
              onClick={() => {
                setPicked(o)
                navigator.vibrate?.(isReal ? [10, 40, 10] : 30)
              }}
              animate={st === 'wrong' ? { x: [0, -6, 6, -4, 4, 0] } : st === 'right' ? { scale: [1, 1.04, 1] } : {}}
              className={`flex h-11 items-center justify-center gap-1 truncate rounded-2xl px-3 text-base font-bold ring-1 transition ${
                st === 'right'
                  ? 'bg-emerald-500 text-[#fff] ring-emerald-500'
                  : st === 'wrong'
                    ? 'bg-neutral-200 text-neutral-400 line-through ring-neutral-200'
                    : st === 'off'
                      ? 'bg-white text-neutral-300 ring-neutral-200'
                      : 'bg-white text-neutral-900 ring-neutral-200 active:scale-95'
              }`}
            >
              {st === 'right' && <Check className="size-4 shrink-0" />}
              {st === 'wrong' && <X className="size-4 shrink-0" />}
              {o}
            </motion.button>
          )
        })}
      </div>
      <p className="h-5 text-center text-sm font-semibold">
        {picked === null ? '' : picked === real ? '🕵️ Esatto! Riconosci le marche al volo' : `Era ${real}!`}
      </p>
      <div className="flex justify-center gap-2 pb-1">
        {picked !== null && (
          <button
            type="button"
            onClick={() => {
              actions.like(product)
              onDone()
            }}
            className="flex h-11 items-center gap-2 rounded-full bg-rose-500 px-5 text-sm font-semibold text-[#fff] active:scale-95"
          >
            <Heart className="size-4 fill-current" /> Lo voglio
          </button>
        )}
        <button type="button" onClick={onDone} className="h-11 rounded-full px-5 text-sm font-semibold text-neutral-500 active:bg-neutral-100">
          {picked === null ? 'Salta' : 'Avanti'}
        </button>
      </div>
    </motion.div>
  )
}

/** Più o meno: il prossimo costa di più o di meno? Si va avanti finché non si sbaglia; il record resta sul telefono. */
function HigherLower({ chain, onDone }: { chain: Product[]; onDone: () => void }) {
  const { actions } = useApp()
  const [i, setI] = useState(0)
  const [result, setResult] = useState<'ok' | 'ko' | 'end' | null>(null)
  const [best] = useState(() => load<number>('piumenoBest', 0))
  const price = (p: Product) => freshPrice(p)!.price
  const a = chain[i]
  const b = chain[i + 1]
  const streak = result === 'ko' ? i : i + (result === 'end' ? 1 : 0)
  const guess = (up: boolean) => {
    const right = up === price(b) > price(a)
    navigator.vibrate?.(right ? [10, 40, 10] : 30)
    if (!right) {
      setResult('ko')
      if (i > best) save('piumenoBest', i)
      return
    }
    setResult('ok')
    setTimeout(() => {
      if (i + 2 >= chain.length) {
        setResult('end')
        if (i + 1 > best) save('piumenoBest', i + 1)
      } else {
        setI(i + 1)
        setResult(null)
      }
    }, 900)
  }
  const over = result === 'ko' || result === 'end'
  const card = (p: Product, show: boolean, tone = '') => (
    <div className={`relative flex min-h-0 flex-1 items-center gap-3 overflow-hidden rounded-2xl bg-white p-2 shadow-md ring-2 ${tone || 'ring-transparent'}`}>
      <div className="relative h-full w-2/5 shrink-0 bg-[#fff]">
        <ProductImage product={p} eager className="absolute inset-0 size-full object-contain" />
      </div>
      <div className="min-w-0 space-y-1">
        <p className="line-clamp-3 text-xs font-medium">{p.title}</p>
        <p className="text-2xl font-black">{show ? formatPrice(price(p)) : '? €'}</p>
      </div>
    </div>
  )
  return (
    <motion.div {...fade} className={frame} role="dialog" aria-label="Più o meno" data-break>
      <div className="pt-1 text-center">
        <p className="flex items-center justify-center gap-2 text-xl font-black">
          <TrendingUp className="size-5 text-rose-500" /> Più o meno?
        </p>
        <p className="text-sm text-neutral-500">
          Di fila: <strong className="text-neutral-900">{streak}</strong> · Record: {Math.max(best, over ? streak : 0)}
        </p>
      </div>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={a.id} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }} className="flex min-h-0 flex-1 flex-col gap-2">
          {card(a, true)}
          {card(b, result !== null, result === 'ko' ? 'ring-neutral-300' : result ? 'ring-emerald-500' : '')}
        </motion.div>
      </AnimatePresence>
      {!over ? (
        <div className="grid grid-cols-2 gap-2 px-1 pb-1">
          <button type="button" disabled={result !== null} onClick={() => guess(true)} className="flex h-12 items-center justify-center gap-1 rounded-2xl bg-white text-base font-bold ring-1 ring-neutral-200 active:scale-95">
            <ArrowUp className="size-5 text-emerald-600" /> Di più
          </button>
          <button type="button" disabled={result !== null} onClick={() => guess(false)} className="flex h-12 items-center justify-center gap-1 rounded-2xl bg-white text-base font-bold ring-1 ring-neutral-200 active:scale-95">
            <ArrowDown className="size-5 text-rose-500" /> Di meno
          </button>
          <button type="button" onClick={onDone} className="col-span-2 h-9 text-sm font-semibold text-neutral-500">
            Basta così
          </button>
        </div>
      ) : (
        <>
          <p className="text-center text-sm font-semibold">
            {result === 'end' ? `🏆 Tutti giusti! ${streak} di fila` : streak > best ? `🎉 Nuovo record: ${streak} di fila!` : `Peccato! ${streak} di fila`}
          </p>
          <div className="flex justify-center gap-2 pb-1">
            <button
              type="button"
              onClick={() => {
                actions.like(b)
                onDone()
              }}
              className="flex h-11 items-center gap-2 rounded-full bg-rose-500 px-5 text-sm font-semibold text-[#fff] active:scale-95"
            >
              <Heart className="size-4 fill-current" /> Salva l'ultimo
            </button>
            <button type="button" onClick={onDone} className="h-11 rounded-full px-5 text-sm font-semibold text-neutral-500 active:bg-neutral-100">
              Avanti
            </button>
          </div>
        </>
      )}
    </motion.div>
  )
}

/** Gratta lo sconto: si gratta (o si tocca) l'etichetta argentata e appare lo sconto vero di oggi. */
function ScratchDeal({ product, onDone }: { product: Product; onDone: () => void }) {
  const { actions } = useApp()
  const fp = freshPrice(product)!
  const [scratched, setScratched] = useState(0)
  const open = scratched >= 1
  const scratch = (amount: number) =>
    setScratched((v) => {
      const n = Math.min(1, v + amount)
      if (n >= 1 && v < 1) navigator.vibrate?.([10, 40, 10])
      return n
    })
  return (
    <motion.div {...fade} className={frame} role="dialog" aria-label="Gratta lo sconto" data-break>
      <div className="pt-1 text-center">
        <p className="flex items-center justify-center gap-2 text-xl font-black">
          <Percent className="size-5 text-rose-500" /> Gratta lo sconto
        </p>
        <p className="text-sm text-neutral-500">Quanto è scontato oggi?</p>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-[#fff] shadow-md">
        <ProductImage product={product} eager className="absolute inset-0 size-full object-contain p-3" />
      </div>
      <p className="line-clamp-2 px-2 text-center text-sm font-medium">{product.title}</p>
      <div
        className="relative mx-auto flex h-24 w-64 touch-none items-center justify-center overflow-hidden rounded-2xl bg-rose-500 text-[#fff] select-none"
        onPointerMove={(e) => e.buttons && scratch(0.04)}
        onClick={() => scratch(0.34)}
        role="button"
        aria-label={open ? `Sconto ${fp.discountPct}%` : 'Gratta qui'}
      >
        <motion.div initial={false} animate={open ? { scale: [1, 1.15, 1] } : {}} className="text-center">
          <p className="text-4xl leading-none font-black">-{fp.discountPct}%</p>
          <p className="mt-1 text-sm font-semibold">
            <span className="line-through opacity-80">{formatPrice(product.originalPrice!)}</span> {formatPrice(fp.price)}
          </p>
        </motion.div>
        <motion.div
          animate={{ opacity: 1 - scratched }}
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[repeating-linear-gradient(45deg,#c9cdd2_0_8px,#b6bbc1_8px_16px)] text-sm font-bold text-neutral-600"
        >
          <span className="rounded-full bg-[#e5e7ea] px-3 py-1 text-[#4b5563]">✋ Gratta qui</span>
        </motion.div>
      </div>
      <div className="flex justify-center gap-2 pb-1">
        {open && (
          <button
            type="button"
            onClick={() => {
              actions.like(product)
              onDone()
            }}
            aria-label="Lo voglio"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-rose-500 text-[#fff] active:scale-95"
          >
            <Heart className="size-5 fill-current" />
          </button>
        )}
        {open && (
          <StoreLink
            product={product}
            className="flex h-11 items-center gap-2 rounded-full bg-neutral-900 px-5 text-sm font-semibold whitespace-nowrap text-white active:scale-95"
          />
        )}
        <button type="button" onClick={onDone} className="h-11 rounded-full px-5 text-sm font-semibold text-neutral-500 active:bg-neutral-100">
          {open ? 'Avanti' : 'Salta'}
        </button>
      </div>
    </motion.div>
  )
}

/** Carta misteriosa: una carta coperta che, girata, mostra il prodotto più scontato del momento. */
function MysteryCard({ product, onDone }: { product: Product; onDone: () => void }) {
  const { actions } = useApp()
  const fp = freshPrice(product)!
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const flip = () => {
    if (open) return
    navigator.vibrate?.([10, 40, 10])
    setOpen(true)
  }
  return (
    <motion.div {...fade} className={frame} role="dialog" aria-label="Carta misteriosa" data-break>
      <div className="pt-1 text-center">
        <p className="flex items-center justify-center gap-2 text-xl font-black">
          <Sparkles className="size-5 text-[#8b5cf6]" /> Carta misteriosa
        </p>
        <p className="text-sm text-neutral-500">{open ? `Uno dei più scontati di oggi: -${fp.discountPct}%` : 'Sotto c\'è uno dei prodotti più scontati di oggi'}</p>
      </div>
      <div className="relative min-h-0 flex-1 [perspective:1200px]">
        <motion.div
          className="relative size-full [transform-style:preserve-3d]"
          initial={false}
          animate={{ rotateY: open ? 180 : 0 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
        >
          {/* Dorso: si tocca per girarla */}
          <button
            type="button"
            onClick={flip}
            aria-label="Gira la carta"
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-[linear-gradient(135deg,#7c3aed,#db2777)] text-[#fff] shadow-lg [backface-visibility:hidden]"
          >
            <motion.span animate={{ scale: [1, 1.12, 1] }} transition={{ repeat: Infinity, duration: 1.6 }} className="text-7xl leading-none">
              ❓
            </motion.span>
            <span className="text-lg font-black tracking-wide">Tocca per girarla</span>
          </button>
          {/* Fronte: il prodotto */}
          <div className="absolute inset-0 flex flex-col overflow-hidden rounded-2xl bg-[#fff] shadow-lg [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <div className="relative min-h-0 flex-1">
              <ProductImage product={product} eager className="absolute inset-0 size-full object-contain p-3" />
              <span className="absolute top-3 left-3 rounded-full bg-rose-500 px-3 py-1 text-lg font-black text-[#fff] shadow">-{fp.discountPct}%</span>
            </div>
            <div className="space-y-0.5 p-3 text-[#171717]">
              <p className="line-clamp-2 text-sm font-medium">{product.title}</p>
              <p className="text-sm">
                <strong className="text-lg">{formatPrice(fp.price)}</strong>{' '}
                <span className="text-[#737373] line-through">{formatPrice(fp.originalPrice!)}</span>
              </p>
            </div>
          </div>
        </motion.div>
      </div>
      <div className="flex justify-center gap-2 pb-1">
        {open && (
          <button
            type="button"
            disabled={saved}
            onClick={() => {
              actions.like(product)
              setSaved(true)
            }}
            aria-label={saved ? 'Salvato nei preferiti' : 'Salva nei preferiti'}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-rose-500 text-[#fff] active:scale-95 disabled:opacity-60"
          >
            {saved ? <Check className="size-5" /> : <Heart className="size-5 fill-current" />}
          </button>
        )}
        {open && (
          <StoreLink
            product={product}
            className="flex h-11 items-center gap-2 rounded-full bg-neutral-900 px-5 text-sm font-semibold whitespace-nowrap text-white active:scale-95"
          />
        )}
        <button type="button" onClick={onDone} className="h-11 rounded-full px-5 text-sm font-semibold text-neutral-500 active:bg-neutral-100">
          {open ? 'Avanti' : 'Salta'}
        </button>
      </div>
    </motion.div>
  )
}

/** Ordina per prezzo: si toccano i 4 prodotti dal meno caro al più caro, poi si vedono i prezzi veri. */
function SortByPrice({ products, onDone }: { products: Product[]; onDone: () => void }) {
  const [order, setOrder] = useState<string[]>([])
  const price = (p: Product) => freshPrice(p)!.price
  const right = [...products].sort((a, b) => price(a) - price(b)).map((p) => p.id)
  const done = order.length === products.length
  const score = done ? order.filter((id, i) => right[i] === id).length : 0
  return (
    <motion.div {...fade} className={frame} role="dialog" aria-label="Ordina per prezzo" data-break>
      <div className="pt-1 text-center">
        <p className="flex items-center justify-center gap-2 text-xl font-black">
          <ArrowUpDown className="size-5 text-rose-500" /> Ordina per prezzo
        </p>
        <p className="text-sm text-neutral-500">Tocca dal meno caro al più caro</p>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-2">
        {products.map((p) => {
          const pos = order.indexOf(p.id)
          const ok = done && right[pos] === p.id
          return (
            <motion.button
              key={p.id}
              type="button"
              disabled={pos >= 0}
              onClick={() => {
                navigator.vibrate?.(10)
                setOrder([...order, p.id])
              }}
              animate={done && !ok ? { x: [0, -5, 5, -3, 3, 0] } : {}}
              className={`relative flex min-h-0 flex-col overflow-hidden rounded-2xl bg-white p-1.5 text-left shadow-md ring-2 ${
                done ? (ok ? 'ring-emerald-500' : 'ring-rose-400') : pos >= 0 ? 'ring-[#4f46e5]' : 'ring-transparent'
              }`}
            >
              <div className="relative min-h-0 flex-1 bg-[#fff]">
                <ProductImage product={p} eager className="absolute inset-0 size-full object-contain" />
              </div>
              <p className="truncate pt-1 text-[11px] font-medium">{p.title}</p>
              <p className="h-5 text-sm font-black">{done ? formatPrice(price(p)) : ''}</p>
              {pos >= 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.25, 1] }}
                  className={`absolute top-2 left-2 grid size-11 place-items-center rounded-full text-xl font-black text-[#fff] shadow-lg ring-2 ring-[#fff] ${done ? (ok ? 'bg-emerald-500' : 'bg-rose-500') : 'bg-[#4f46e5]'}`}
                >
                  {pos + 1}
                </motion.span>
              )}
            </motion.button>
          )
        })}
      </div>
      <p className="h-5 text-center text-sm font-semibold">
        {!done ? '' : score === 4 ? '🏆 Perfetto! Tutti al posto giusto' : score >= 2 ? `Non male: ${score} su 4 al posto giusto` : `Solo ${score} su 4: i prezzi ingannano!`}
      </p>
      <div className="flex justify-center gap-2 pb-1">
        {!done && order.length > 0 && (
          <button type="button" onClick={() => setOrder([])} className="h-11 rounded-full px-5 text-sm font-semibold text-neutral-500 active:bg-neutral-100">
            Ricomincia
          </button>
        )}
        <button type="button" onClick={onDone} className="h-11 rounded-full px-5 text-sm font-semibold text-neutral-500 active:bg-neutral-100">
          {done ? 'Avanti' : 'Salta'}
        </button>
      </div>
    </motion.div>
  )
}

/** Nome corto per la fetta: "Abbigliamento sportivo" → "Sportivo", "Occhiali da sole" → "Occhiali". */
const wheelLabel = (l: string) => {
  if (l.length <= 14) return l
  const w = l.split(' ')
  return w[0] === 'Abbigliamento' ? w.at(-1)!.replace(/^./, (c) => c.toUpperCase()) : w[0]
}

const WHEEL_COLORS = ['#f43f5e', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7']

/** Ruota della fortuna: gira e la categoria che esce passa in cima al mazzo per 15 swipe. */
function Wheel({ options, onDone }: { options: { category: string; product: Product }[]; onDone: () => void }) {
  const { state } = useApp()
  const [angle, setAngle] = useState(0)
  const [won, setWon] = useState<string | null>(null)
  const n = options.length
  const slice = 360 / n
  const spin = () => {
    if (angle) return
    const pick = Math.floor(Math.random() * n)
    // Il centro della fetta scelta finisce sotto la freccia in alto (più qualche giro completo).
    setAngle(360 * 5 + (360 - (pick * slice + slice / 2)))
    navigator.vibrate?.(10)
    setTimeout(() => {
      setWon(options[pick].category)
      setBoost({ section: state.mode, category: options[pick].category, left: 15 })
      navigator.vibrate?.([10, 40, 10])
      setTimeout(onDone, 1600)
    }, 3200)
  }
  const label = (c: string) => categoryLabel(c as CategoryId)
  const r = 100
  const point = (deg: number) => [r + r * Math.sin((deg * Math.PI) / 180), r - r * Math.cos((deg * Math.PI) / 180)]
  return (
    <motion.div {...fade} className={frame} role="dialog" aria-label="Ruota della fortuna" data-break>
      <div className="pt-1 text-center">
        <p className="flex items-center justify-center gap-2 text-xl font-black">
          <Disc3 className="size-5 text-rose-500" /> Ruota della fortuna
        </p>
        <p className="text-sm text-neutral-500">Gira: quello che esce lo vedi nei prossimi swipe</p>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <div className="relative aspect-square h-full max-h-80 max-w-full">
          <span className="absolute -top-1 left-1/2 z-10 -translate-x-1/2 text-3xl leading-none drop-shadow">🔻</span>
          <motion.svg
            viewBox="0 0 200 200"
            className="size-full drop-shadow-lg"
            animate={{ rotate: angle }}
            transition={{ duration: 3.1, ease: [0.15, 0.85, 0.25, 1] }}
          >
            {options.map((o, i) => {
              const [x1, y1] = point(i * slice)
              const [x2, y2] = point((i + 1) * slice)
              const mid = i * slice + slice / 2
              return (
                <g key={o.category}>
                  <path d={`M100 100 L${x1} ${y1} A100 100 0 0 1 ${x2} ${y2} Z`} fill={WHEEL_COLORS[i % WHEEL_COLORS.length]} stroke="#fff" strokeWidth="1.5" />
                  <text
                    x="100"
                    y="30"
                    transform={`rotate(${mid} 100 100)`}
                    textAnchor="middle"
                    fontSize="9.5"
                    fontWeight="800"
                    fill="#fff"
                  >
                    {wheelLabel(label(o.category))}
                  </text>
                </g>
              )
            })}
            <circle cx="100" cy="100" r="16" fill="#fff" />
          </motion.svg>
        </div>
      </div>
      <p className="h-5 text-center text-sm font-semibold text-rose-500">{won ? `🎉 È uscito: ${label(won)}!` : ''}</p>
      <div className="flex justify-center gap-2 pb-1">
        <button
          type="button"
          onClick={spin}
          disabled={angle !== 0}
          className="h-11 rounded-full bg-rose-500 px-8 text-sm font-bold text-[#fff] active:scale-95 disabled:opacity-50"
        >
          Gira!
        </button>
        {!angle && (
          <button type="button" onClick={onDone} className="h-11 rounded-full px-5 text-sm font-semibold text-neutral-500 active:bg-neutral-100">
            Salta
          </button>
        )}
      </div>
    </motion.div>
  )
}

/** Il pezzo che manca: un outfit vero con un buco (di solito le scarpe) e 3 capi tra cui scegliere. */
function MissingPiece({ outfit, missing, options, onDone }: { outfit: Outfit; missing: number; options: Product[]; onDone: () => void }) {
  const [chosen, setChosen] = useState<Product | null>(null)
  const [saved, setSaved] = useState(false)
  const items = outfit.items.map((p, i) => (i === missing ? chosen : p))
  const saveOutfit = () => {
    if (!chosen) return
    const ids = outfit.items.map((p, i) => (i === missing ? chosen.id : p.id))
    const list = load<{ id: string }[]>('outfitsSaved', [])
    const id = outfitId(ids)
    if (!list.some((s) => s.id === id)) {
      save('outfitsSaved', [{ id, gender: outfit.gender, style: outfit.style, items: ids, savedAt: Date.now() }, ...list])
      window.dispatchEvent(new Event(OUTFITS_SAVED_EVENT))
    }
    setSaved(true)
    navigator.vibrate?.(15)
    setTimeout(onDone, 900)
  }
  return (
    <motion.div {...fade} className={frame} role="dialog" aria-label="Il pezzo che manca" data-break>
      <div className="pt-1 text-center">
        <p className="flex items-center justify-center gap-2 text-xl font-black">
          <Footprints className="size-5 text-rose-500" /> Il pezzo che manca
        </p>
        <p className="text-sm text-neutral-500">Outfit {STYLE_LABEL[outfit.style].toLowerCase()}: cosa ci metti?</p>
      </div>
      <div className={`grid min-h-0 flex-1 gap-1.5 ${items.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {items.map((p, i) => (
          <div
            key={i}
            className={`relative min-h-0 overflow-hidden rounded-xl ${p ? 'bg-[#fff] shadow-sm' : 'grid place-items-center border-2 border-dashed border-neutral-300'}`}
          >
            {p ? <ProductImage product={p} eager className="absolute inset-0 size-full object-contain p-1" /> : <span className="text-3xl font-black text-neutral-300">?</span>}
          </div>
        ))}
      </div>
      <div className="grid h-28 shrink-0 grid-cols-3 gap-2">
        {options.map((p) => (
          <motion.button
            key={p.id}
            type="button"
            onClick={() => {
              setChosen(p)
              navigator.vibrate?.(10)
            }}
            animate={{ scale: chosen?.id === p.id ? 1.05 : 1 }}
            className={`relative overflow-hidden rounded-2xl bg-[#fff] shadow-md ring-2 ${chosen?.id === p.id ? 'ring-rose-500' : 'ring-transparent'}`}
          >
            <ProductImage product={p} eager className="absolute inset-0 size-full object-contain p-1.5" />
          </motion.button>
        ))}
      </div>
      <div className="flex justify-center gap-2 pb-1">
        {chosen && (
          <button
            type="button"
            onClick={saveOutfit}
            disabled={saved}
            className="flex h-11 items-center gap-2 rounded-full bg-rose-500 px-5 text-sm font-semibold text-[#fff] active:scale-95"
          >
            <Heart className="size-4 fill-current" /> {saved ? 'Salvato!' : "Salva l'outfit"}
          </button>
        )}
        <button type="button" onClick={onDone} className="h-11 rounded-full px-5 text-sm font-semibold text-neutral-500 active:bg-neutral-100">
          {chosen ? 'Avanti' : 'Salta'}
        </button>
      </div>
    </motion.div>
  )
}
