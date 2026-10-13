import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Heart, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { track } from '../lib/analytics'
import { useApp } from '../state/AppState'
import { productImageUrl, productUrl, storeLinkLabel, storeName } from '../config/stores'
import { ProductImage } from './ProductImage'
import { CoachMarks } from './CoachMarks'
import { HeartBurst, type Burst } from './HeartBurst'
import { discountBadge } from '../lib/price'
import { SendButton } from './SendButton'
import { StoreLink } from './StoreLink'
import { UndoMenu } from './UndoMenu'
import { SwipeCard, type SwipeDir } from './SwipeCard'
import type { Product } from '../types/product'

// Foto delle prossime carte scaricate e già decodificate in anticipo: quando una carta arriva
// in cima la foto c'è già e lo swipe non scatta. Si tengono vive solo le ultime, per la memoria.
const AHEAD = 8
const preloaded = new Map<string, HTMLImageElement>()
function preload(url?: string) {
  if (!url || preloaded.has(url)) return
  const img = new Image()
  img.decoding = 'async'
  img.src = url
  img.decode?.().catch(() => {})
  preloaded.set(url, img)
  if (preloaded.size > 40) preloaded.delete(preloaded.keys().next().value!)
}

/** Il mazzo della sezione aperta, oppure `cards` (es. Regali, con prodotti di tutte le sezioni: lì niente "annulla"). */
export function SwipeDeck({ cards, onLike }: { cards?: Product[]; onLike?: (p: Product) => void } = {}) {
  const app = useApp()
  const { actions } = app
  const deck = cards ?? app.deck
  const [exitDir, setExitDir] = useState<SwipeDir>(1)
  const [bursts, setBursts] = useState<Burst[]>([])
  // "Salvato! Vedi su Amazon": per qualche secondo dopo un Sì, quando l'interesse è più alto.
  const [saved, setSaved] = useState<Product | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const top = deck[0]
  const visible = deck.slice(0, 3)

  const swipe = useCallback(
    (dir: SwipeDir) => {
      if (!top) return
      setExitDir(dir)
      if (dir === 1) {
        actions.like(top)
        onLike?.(top)
        // Cuori che esplodono; più grandi (e vibrazione più forte) per gli sconti veri dal 30% in su.
        const discount = discountBadge(top)
        const id = Date.now()
        setBursts((b) => [...b.slice(-2), { id, discount }])
        setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 1400)
        navigator.vibrate?.((discount ?? 0) >= 30 ? [15, 40, 25, 40, 35] : 15)
        if (productUrl(top)) {
          setSaved(top)
          clearTimeout(savedTimer.current)
          savedTimer.current = setTimeout(() => setSaved(null), 2000)
        }
      } else actions.dislike(top)
    },
    [top, actions, onLike],
  )

  // Una "visualizzazione" per ogni card che arriva in cima.
  useEffect(() => {
    if (top) track('view', top)
  }, [top])

  useEffect(() => {
    // Prima le carte più vicine; il resto quando il telefono è libero, per non rallentare quella in cima.
    deck.slice(1, 3).forEach((p) => preload(productImageUrl(p) ?? undefined))
    const later = () => deck.slice(3, 1 + AHEAD).forEach((p) => preload(productImageUrl(p) ?? undefined))
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(later, { timeout: 800 })
      return () => cancelIdleCallback(id)
    }
    const t = setTimeout(later, 300)
    return () => clearTimeout(t)
  }, [deck])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      if (e.key === 'ArrowRight') swipe(1)
      else if (e.key === 'ArrowLeft') swipe(-1)
      else if ((e.key === 'z' && (e.ctrlKey || e.metaKey)) || e.key === 'Backspace') actions.undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [swipe, actions])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="relative min-h-0 flex-1">
        <AnimatePresence custom={exitDir}>
          {visible
            .map((p, i) => <SwipeCard key={p.id} product={p} index={i} onSwipe={swipe} />)
            .reverse()}
        </AnimatePresence>
        <HeartBurst bursts={bursts} />
        <AnimatePresence>
          {saved && (
            <motion.div
              key={saved.id}
              initial={{ y: -16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -16, opacity: 0 }}
              className="absolute inset-x-0 top-3 z-30 flex justify-center px-3"
            >
              <StoreLink
                product={saved}
                icon={false}
                className="flex w-full max-w-sm items-center gap-3 rounded-2xl bg-[#18181b]/95 p-2 pr-2.5 text-[#fff] shadow-2xl ring-1 ring-[#fff]/10 backdrop-blur-md active:scale-[0.98]"
              >
                <span className="size-11 shrink-0 overflow-hidden rounded-xl bg-[#fff] p-0.5 ring-2 ring-rose-500">
                  <ProductImage product={saved} className="size-full object-contain" />
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="flex items-center gap-1 text-xs font-medium text-[#fff]/70">
                    <Heart className="size-3 fill-rose-500 text-rose-500" /> Salvato nei preferiti
                  </span>
                  <span className="block truncate text-sm font-semibold">{saved.brand || saved.title}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 rounded-xl bg-rose-500 px-3 py-2 text-sm font-bold text-[#fff]">
                  {storeName(saved.store)} <ArrowRight className="size-4" />
                </span>
              </StoreLink>
            </motion.div>
          )}
        </AnimatePresence>
        <CoachMarks />
      </div>

      <div className="flex items-center justify-center gap-3 sm:gap-4">
        {cards ? <span className="size-11" /> : <UndoMenu />}
        <button
          type="button"
          onClick={() => swipe(-1)}
          aria-label="No, scarta"
          className="flex h-14 items-center gap-2 rounded-full bg-white px-5 font-semibold text-neutral-800 shadow-md ring-1 ring-black/5 transition active:scale-90"
        >
          <X className="size-6" strokeWidth={2.5} /> NO
        </button>
        <button
          type="button"
          onClick={() => swipe(1)}
          aria-label="Sì, salva nei preferiti"
          className="flex h-14 items-center gap-2 rounded-full bg-rose-500 px-5 font-semibold text-[#fff] shadow-lg shadow-rose-500/30 transition active:scale-90"
        >
          <Heart className="size-6 fill-current" /> SÌ
        </button>
        {top ? (
          <SendButton
            product={top}
            className="grid size-11 place-items-center rounded-full bg-white text-neutral-600 shadow-md ring-1 ring-black/5 transition active:scale-90"
          />
        ) : (
          <span className="size-11" />
        )}
      </div>
      {top && (
        <StoreLink
          product={top}
          className="mx-auto flex h-11 w-full max-w-[17rem] items-center justify-center gap-2 rounded-full bg-neutral-900 text-sm font-semibold text-white shadow-md transition active:scale-95"
        >
          {storeLinkLabel(top).toUpperCase()}
        </StoreLink>
      )}
    </div>
  )
}
