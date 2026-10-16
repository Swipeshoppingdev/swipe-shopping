import { m as motion } from 'framer-motion'
import { Heart, Swords, Trophy } from 'lucide-react'
import { useState } from 'react'
import { brandAndStore } from '../config/stores'
import { modelKey } from '../lib/dedupe'
import { useApp } from '../state/AppState'
import type { Product } from '../types/product'
import { PriceTag } from './PriceTag'
import { ProductImage } from './ProductImage'

/** Due prodotti dello stesso tipo tra i prossimi del mazzo, possibilmente di marche diverse. */
export function pickPair(deck: Product[]): [Product, Product] | null {
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

/** Duello: due prodotti uno contro l'altro, "Quale prenderesti?". Il vincitore si può salvare nei preferiti (non in automatico). */
export function DuelView({ pair, onDone }: { pair: [Product, Product]; onDone: () => void }) {
  const { actions } = useApp()
  const [winner, setWinner] = useState<Product | null>(null)
  const choose = (p: Product) => {
    if (winner) return
    setWinner(p)
    navigator.vibrate?.(15)
  }

  return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="game-frame absolute inset-0 z-30 flex flex-col gap-3 rounded-3xl bg-neutral-50 p-1"
          role="dialog"
          aria-label="Duello"
          data-break
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
                        <Trophy className="size-16 fill-amber-400 text-amber-500 drop-shadow-lg" />
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
          <div className="flex justify-center gap-2 pb-1">
            {winner && (
              <button
                type="button"
                onClick={() => {
                  actions.like(winner)
                  onDone()
                }}
                className="flex h-11 items-center gap-2 rounded-full bg-rose-500 px-5 text-sm font-semibold text-[#fff] active:scale-95"
              >
                <Heart className="size-4 fill-current" /> Salva nei preferiti
              </button>
            )}
            <button type="button" onClick={onDone} className="h-11 rounded-full px-5 text-sm font-semibold text-neutral-500 active:bg-neutral-100">
              {winner ? 'Avanti' : 'Nessuno dei due, salta'}
            </button>
          </div>
        </motion.div>
  )
}
