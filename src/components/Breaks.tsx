import { AnimatePresence, motion } from 'framer-motion'
import { Check, Heart, Shuffle, Tag, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { categoryLabel, type CategoryId } from '../config/categories'
import { brandAndStore } from '../config/stores'
import { setBoost, spendBoost } from '../lib/boost'
import { formatPrice, freshPrice } from '../lib/price'
import { load, save } from '../lib/storage'
import { useApp } from '../state/AppState'
import type { Product } from '../types/product'
import { DuelView, pickPair } from './DuelView'
import { ProductImage } from './ProductImage'

/** Ogni quanti swipe arriva una pausa di gioco. */
const EVERY = 8
const KINDS = ['duello', 'prezzo', 'scelta'] as const
type Break =
  | { kind: 'duello'; pair: [Product, Product] }
  | { kind: 'prezzo'; product: Product; options: number[]; price: number }
  | { kind: 'scelta'; options: { category: string; product: Product }[] }

/** Due prezzi finti credibili (circa -40% e +50%), arrotondati come quelli veri. */
function decoys(price: number) {
  const round = (x: number) => (x >= 20 ? Math.round(x) - 0.01 : Math.round(x * 2) / 2 - 0.01)
  const low = round(price * (0.55 + Math.random() * 0.15))
  const high = round(price * (1.4 + Math.random() * 0.3))
  return [low, high].filter((x) => x > 1 && Math.abs(x - price) > 1)
}

function buildBreak(kind: (typeof KINDS)[number], deck: Product[]): Break | null {
  if (kind === 'duello') {
    const pair = pickPair(deck)
    return pair && { kind, pair }
  }
  if (kind === 'prezzo') {
    const product = deck.slice(1, 30).find((p) => freshPrice(p) && !p.priceFrom)
    const price = product && freshPrice(product)!.price
    if (!product || !price) return null
    const d = decoys(price)
    if (d.length < 2) return null
    return { kind, product, price, options: [price, ...d].sort(() => Math.random() - 0.5) }
  }
  // Questo o quello: due categorie con abbastanza prodotti nel mazzo.
  const counts = new Map<string, Product[]>()
  for (const p of deck.slice(1, 150)) counts.set(p.category, [...(counts.get(p.category) ?? []), p])
  const cats = [...counts].filter(([, l]) => l.length >= 5).sort(() => Math.random() - 0.5).slice(0, 2)
  if (cats.length < 2) return null
  return { kind: 'scelta', options: cats.map(([category, l]) => ({ category, product: l[0] })) }
}

/**
 * Pause di gioco nel mazzo, ogni 8 swipe, a rotazione: Duello, Indovina il prezzo, Questo o quello.
 * Spezzano la ripetizione dello swipe; si possono sempre saltare.
 */
export function Breaks() {
  const { state, deck } = useApp()
  const swipes = state.history.length
  const last = useRef(swipes)
  const [current, setCurrent] = useState<Break | null>(null)

  useEffect(() => {
    const added = swipes - last.current
    last.current = swipes
    if (added <= 0) return
    spendBoost(added)
    if (current) return
    const next = load<number>('breakCount', 0) + added
    if (next < EVERY) {
      save('breakCount', next)
      return
    }
    const start = load<number>('breakKind', 0)
    for (let i = 0; i < KINDS.length; i++) {
      const b = buildBreak(KINDS[(start + i) % KINDS.length], deck)
      if (!b) continue
      save('breakCount', 0)
      save('breakKind', (start + i + 1) % KINDS.length)
      // Dopo l'uscita della carta.
      const t = setTimeout(() => setCurrent(b), 450)
      return () => clearTimeout(t)
    }
    save('breakCount', next)
  }, [swipes, deck, current])

  const done = () => setCurrent(null)
  return (
    <AnimatePresence>
      {current?.kind === 'duello' && <DuelView key="d" pair={current.pair} onDone={done} />}
      {current?.kind === 'prezzo' && <PriceGuess key="p" {...current} onDone={done} />}
      {current?.kind === 'scelta' && <ThisOrThat key="s" options={current.options} onDone={done} />}
    </AnimatePresence>
  )
}

const frame = 'absolute inset-0 z-30 flex flex-col gap-3 rounded-3xl bg-neutral-50 p-1'
const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }

/** Indovina il prezzo: tre prezzi, uno è quello vero. Poi "Lo voglio" o "Avanti". */
function PriceGuess({ product, price, options, onDone }: { product: Product; price: number; options: number[]; onDone: () => void }) {
  const { actions } = useApp()
  const [picked, setPicked] = useState<number | null>(null)
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

/** Questo o quello: "Cosa vuoi vedere adesso?". La categoria scelta passa in cima al mazzo per 15 swipe. */
function ThisOrThat({ options, onDone }: { options: { category: string; product: Product }[]; onDone: () => void }) {
  const { state } = useApp()
  const [chosen, setChosen] = useState<string | null>(null)
  const label = (c: string) => categoryLabel(c as CategoryId)
  return (
    <motion.div {...fade} className={frame} role="dialog" aria-label="Questo o quello" data-break>
      <div className="pt-1 text-center">
        <p className="flex items-center justify-center gap-2 text-xl font-black">
          <Shuffle className="size-5 text-rose-500" /> Questo o quello?
        </p>
        <p className="text-sm text-neutral-500">Cosa vuoi vedere adesso?</p>
      </div>
      <div className="grid min-h-0 flex-1 grid-rows-2 gap-2">
        {options.map((o, i) => {
          const on = chosen === o.category
          return (
            <motion.button
              key={o.category}
              type="button"
              initial={{ y: i === 0 ? -30 : 30, opacity: 0 }}
              animate={{ y: 0, opacity: chosen && !on ? 0.35 : 1, scale: on ? 1.03 : 1 }}
              onClick={() => {
                if (chosen) return
                setChosen(o.category)
                setBoost({ section: state.mode, category: o.category, left: 15 })
                navigator.vibrate?.(15)
                setTimeout(onDone, 900)
              }}
              className={`relative flex min-h-0 items-center gap-3 overflow-hidden rounded-2xl bg-white p-2 text-left shadow-md ring-2 ${on ? 'ring-rose-500' : 'ring-transparent'}`}
            >
              <div className="relative h-full w-2/5 shrink-0 bg-[#fff]">
                <ProductImage product={o.product} eager className="absolute inset-0 size-full object-contain" />
              </div>
              <span className="text-2xl leading-tight font-black">{label(o.category)}</span>
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
