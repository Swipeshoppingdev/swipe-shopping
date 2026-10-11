import { AnimatePresence } from 'framer-motion'
import { Heart, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { track } from '../lib/analytics'
import { useApp } from '../state/AppState'
import { productImageUrl, storeLinkLabel } from '../config/stores'
import { CoachMarks } from './CoachMarks'
import { SendButton } from './SendButton'
import { StoreLink } from './StoreLink'
import { UndoMenu } from './UndoMenu'
import { SwipeCard, type SwipeDir } from './SwipeCard'

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

export function SwipeDeck() {
  const { deck, actions } = useApp()
  const [exitDir, setExitDir] = useState<SwipeDir>(1)
  const top = deck[0]
  const visible = deck.slice(0, 3)

  const swipe = useCallback(
    (dir: SwipeDir) => {
      if (!top) return
      setExitDir(dir)
      if (dir === 1) {
        actions.like(top)
        navigator.vibrate?.(12)
      } else actions.dislike(top)
    },
    [top, actions],
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
        <CoachMarks />
      </div>

      <div className="flex items-center justify-center gap-3 sm:gap-4">
        <UndoMenu />
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
