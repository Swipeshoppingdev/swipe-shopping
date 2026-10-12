import { AnimatePresence, motion } from 'framer-motion'
import { Heart, Swords } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { brandAndStore } from '../config/stores'
import { modelKey } from '../lib/dedupe'
import { load, save } from '../lib/storage'
import { useApp } from '../state/AppState'
import type { Product } from '../types/product'
import { PriceTag } from './PriceTag'
import { ProductImage } from './ProductImage'

/** Ogni quanti swipe arriva un duello. */
const EVERY = 12

/** Due prodotti dello stesso tipo tra i prossimi del mazzo, possibilmente di marche diverse. */
function pickPair(deck: Product[]): [Product, Product] | null {
  const pool = deck.slice(1, 40)
  const byCat = new Map<string, Product[]>()
  for (const p of pool) byCat.set(p.category, [...(byCat.get(p.category) ?? []), p])
  const cats = [...byCat.values()].filter((l) => l.length >= 2)
  if (!cats.length) return null
  const list = cats[Math.floor(Math.random() * cats.length)]
  const a = list[0]
  const b = list.find((p) => p.brand !== a.brand && modelKey(p) !== modelKey(a)) ?? list.find((p) => modelKey(p) !== modelKey(a))
  return b ? [a, b] : null
}

/**
 * Duello: ogni tanto, tra uno swipe e l'altro, due prodotti uno contro l'altro: "Quale prenderesti?".
 * Il vincitore va nei preferiti, l'altro resta nel mazzo. Si può saltare.
 */
export function Duel() {
  const { state, deck, actions } = useApp()
  const swipes = state.history.length
  const last = useRef(swipes)
  const [pair, setPair] = useState<[Product, Product] | null>(null)
  const [winner, setWinner] = useState<Product | null>(null)

  useEffect(() => {
    const added = swipes - last.current
    last.current = swipes
    if (added <= 0 || pair) return
    const next = load<number>('duelCount', 0) + added
    if (next >= EVERY) {
      const p = pickPair(deck)
      if (p) {
        save('duelCount', 0)
        // Dopo l'uscita della carta.
        const t = setTimeout(() => setPair(p), 450)
        return () => clearTimeout(t)
      }
    }
    save('duelCount', next)
  }, [swipes, deck, pair])

  const choose = (p: Product) => {
    if (winner) return
    setWinner(p)
    actions.like(p)
    navigator.vibrate?.(15)
    setTimeout(() => {
      setPair(null)
      setWinner(null)
    }, 1100)
  }

  return (
    <AnimatePresence>
      {pair && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-30 flex flex-col gap-3 rounded-3xl bg-neutral-50 p-1"
          role="dialog"
          aria-label="Duello"
        >
          <div className="pt-1 text-center">
            <p className="flex items-center justify-center gap-2 text-xl font-black">
              <Swords className="size-5 text-rose-500" /> Duello
            </p>
            <p className="text-sm text-neutral-500">Quale prenderesti? Tocca il tuo preferito</p>
          </div>
          <div className="relative grid min-h-0 flex-1 grid-cols-2 gap-2">
            {pair.map((p, i) => {
              const won = winner?.id === p.id
              const lost = !!winner && !won
              return (
                <motion.button
                  key={p.id}
                  type="button"
                  onClick={() => choose(p)}
                  initial={{ x: i === 0 ? -40 : 40, opacity: 0 }}
                  animate={{ x: 0, opacity: lost ? 0.35 : 1, scale: won ? 1.04 : lost ? 0.94 : 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                  className={`relative flex min-h-0 flex-col overflow-hidden rounded-2xl bg-white text-left shadow-md ring-2 ${won ? 'ring-rose-500' : 'ring-transparent'}`}
                >
                  <div className="relative min-h-0 flex-1 bg-[#fff]">
                    <ProductImage product={p} eager className="absolute inset-0 size-full object-contain p-2" />
                    {won && (
                      <motion.span initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }} className="absolute inset-0 grid place-items-center">
                        <Heart className="size-16 fill-rose-500 text-rose-500 drop-shadow-lg" />
                      </motion.span>
                    )}
                  </div>
                  <div className="space-y-0.5 p-2.5">
                    <p className="truncate text-[10px] font-medium tracking-wide text-neutral-500 uppercase">{brandAndStore(p)}</p>
                    <p className="line-clamp-2 text-xs leading-snug font-medium">{p.title}</p>
                    <PriceTag product={p} />
                  </div>
                </motion.button>
              )
            })}
            <span className="pointer-events-none absolute top-1/3 left-1/2 grid size-11 -translate-x-1/2 place-items-center rounded-full bg-neutral-900 text-sm font-black text-white shadow-lg">
              VS
            </span>
          </div>
          <p className="h-5 text-center text-sm font-semibold text-rose-500">{winner ? 'Salvato nei preferiti 💖' : ''}</p>
          <button
            type="button"
            onClick={() => setPair(null)}
            className="mx-auto mb-1 h-10 rounded-full px-5 text-sm font-semibold text-neutral-500 active:bg-neutral-100"
          >
            Nessuno dei due, salta
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
