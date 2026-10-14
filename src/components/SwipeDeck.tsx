import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Heart, X } from 'lucide-react'
import { startTransition, useCallback, useDeferredValue, useEffect, useRef, useState, type ReactNode } from 'react'
import { track } from '../lib/analytics'
import { useApp } from '../state/AppState'
import { productImageUrl, productUrl, storeLinkLabel, storeName } from '../config/stores'
import { ProductImage } from './ProductImage'
import { CoachMarks } from './CoachMarks'
import { HeartBurst, type Burst } from './HeartBurst'
import { discountBadge } from '../lib/price'
import { priceRank } from '../lib/priceCheck'
import { loadDetails } from '../lib/details'
import { ShareButton } from './ShareButton'
import { StoreLink } from './StoreLink'
import { UndoMenu } from './UndoMenu'
import { SwipeCard, type SwipeDir } from './SwipeCard'
import type { Product } from '../types/product'

// Foto delle prossime carte scaricate e già decodificate in anticipo: quando una carta arriva
// in cima la foto c'è già e lo swipe non scatta. Si tengono vive solo le ultime, per la memoria.
const AHEAD = 8
/**
 * Lo swipe si registra (preferiti, mazzo, statistiche) solo quando la carta è già uscita: il ricalcolo del mazzo
 * pesa e, fatto subito, faceva scattare l'animazione di uscita sui telefoni lenti.
 */
const COMMIT_MS = 380
/** Quanto resta il popup "Salvato! Vedi su Amazon" dopo un Sì. */
const SAVED_MS = 1500
/**
 * Con il popup aperto il Sì si registra dopo che il popup si è chiuso: il ricalcolo del mazzo, fatto mentre
 * il popup appare, rallentava il tocco sul link Amazon sui telefoni lenti.
 */
const SAVED_COMMIT_MS = SAVED_MS + 200
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

/** Il mazzo della sezione aperta, oppure `cards` (es. Regali, con prodotti di tutte le sezioni e il suo `undo`). */
export function SwipeDeck({
  cards,
  onLike,
  onDislike,
  undo,
}: { cards?: Product[]; onLike?: (p: Product) => void; onDislike?: (p: Product) => void; undo?: ReactNode } = {}) {
  const app = useApp()
  const { actions } = app
  const deck = cards ?? app.deck
  const [exitDir, setExitDir] = useState<SwipeDir>(1)
  const [bursts, setBursts] = useState<Burst[]>([])
  // "Salvato! Vedi su Amazon": per qualche secondo dopo un Sì, quando l'interesse è più alto.
  const [saved, setSaved] = useState<Product | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const hideSavedIn = useCallback((ms: number) => {
    clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSaved(null), ms)
  }, [])
  // Il tempo parte quando il popup è davvero sullo schermo (sui telefoni lenti arriva un attimo dopo il Sì).
  useEffect(() => {
    if (saved) hideSavedIn(SAVED_MS)
  }, [saved, hideSavedIn])
  // Carte già swipate ma non ancora registrate (vedi COMMIT_MS): spariscono subito dal mazzo mostrato.
  const [leaving, setLeaving] = useState<string[]>([])
  const pending = useRef<{ run: () => void; timer: ReturnType<typeof setTimeout> }[]>([])
  const flush = useCallback(() => {
    const list = pending.current
    pending.current = []
    for (const item of list) {
      clearTimeout(item.timer)
      item.run()
    }
    setLeaving([])
  }, [])
  // Se l'app va in background (es. si apre Amazon) gli swipe in sospeso si registrano subito.
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush()
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [flush])
  // Uscendo dalla pagina gli swipe in sospeso si registrano subito.
  useEffect(
    () => () => {
      for (const item of pending.current) {
        clearTimeout(item.timer)
        item.run()
      }
      pending.current = []
    },
    [],
  )
  const shown = leaving.length ? deck.filter((p) => !leaving.includes(p.id)) : deck
  const top = shown[0]
  // La carta nuova in fondo (la terza, ancora invisibile) si aggiunge un attimo dopo, con un render che non blocca:
  // nel momento dello swipe si fa solo il minimo, così la carta esce senza scatti.
  const settled = useDeferredValue(shown)
  const ready = new Set(settled.slice(0, 3).map((p) => p.id))
  const visible = shown.slice(0, 3).filter((p, i) => i < 2 || ready.has(p.id))

  const swipe = useCallback(
    (dir: SwipeDir) => {
      if (!top) return
      setExitDir(dir)
      const p = top
      const run = () => {
        if (dir === 1) {
          actions.like(p)
          onLike?.(p)
        } else {
          actions.dislike(p)
          onDislike?.(p)
        }
      }
      setLeaving((l) => [...l, p.id])
      const withPopup = dir === 1 && !!productUrl(p)
      const item = {
        run,
        timer: setTimeout(() => {
          pending.current = pending.current.filter((x) => x !== item)
          // Render interrompibile: se intanto si trascina la carta successiva, il dito ha la precedenza.
          startTransition(() => {
            run()
            setLeaving((l) => l.filter((id) => id !== p.id))
          })
        }, withPopup ? SAVED_COMMIT_MS : COMMIT_MS),
      }
      pending.current.push(item)
      if (dir === 1) {
        // Cuori che esplodono; più grandi (e vibrazione più forte) per gli sconti veri dal 30% in su.
        const discount = discountBadge(top)
        const id = Date.now()
        setBursts((b) => [...b.slice(-2), { id, discount }])
        setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 1400)
        navigator.vibrate?.((discount ?? 0) >= 30 ? [15, 40, 25, 40, 35] : 15)
        if (withPopup) {
          clearTimeout(savedTimer.current)
          startTransition(() => setSaved(p))
        }
      }
    },
    [top, actions, onLike, onDislike],
  )

  // Una "visualizzazione" per ogni card che arriva in cima.
  useEffect(() => {
    if (top) track('view', top)
  }, [top])

  useEffect(() => {
    // Prima le carte più vicine; il resto quando il telefono è libero, per non rallentare quella in cima.
    shown.slice(1, 3).forEach((p) => preload(productImageUrl(p) ?? undefined))
    const later = () => {
      shown.slice(3, 1 + AHEAD).forEach((p) => preload(productImageUrl(p) ?? undefined))
      // "Prezzo giusto?" della prossima carta calcolato ora: quando arriva in cima non rallenta lo swipe.
      if (shown[1]) priceRank(shown[1], app.allProducts)
      // Anche le foto in più e le caratteristiche (file di dettagli) delle prossime carte, ora che il telefono è libero.
      shown.slice(1, 3).forEach((p) => void loadDetails(p.id))
    }
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(later, { timeout: 800 })
      return () => cancelIdleCallback(id)
    }
    const t = setTimeout(later, 300)
    return () => clearTimeout(t)
  }, [shown, app.allProducts])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      if (e.key === 'ArrowRight') swipe(1)
      else if (e.key === 'ArrowLeft') swipe(-1)
      else if ((e.key === 'z' && (e.ctrlKey || e.metaKey)) || e.key === 'Backspace') {
        flush()
        actions.undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [swipe, actions, flush])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="relative min-h-0 flex-1">
        <AnimatePresence custom={exitDir} initial={false}>
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
              // Con il dito sopra il popup resta: se spariva a metà tocco, il tocco finiva sulla carta sotto
              // (si apriva la scheda) e il link Amazon sembrava non rispondere.
              onPointerDown={() => clearTimeout(savedTimer.current)}
              onPointerUp={() => hideSavedIn(SAVED_MS)}
              onPointerCancel={() => hideSavedIn(SAVED_MS)}
            >
              <StoreLink
                product={saved}
                icon={false}
                // Si va su Amazon: il Sì si registra subito dopo aver aperto il link (vedi SAVED_COMMIT_MS).
                onClickCapture={() => {
                  setTimeout(flush, 250)
                  hideSavedIn(600)
                }}
                className="flex w-full max-w-sm items-center gap-3 rounded-2xl bg-[#18181b]/95 p-2 pr-2.5 text-[#fff] shadow-2xl ring-1 ring-[#fff]/10 active:scale-[0.98]"
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
        {cards ? (undo ?? <span className="size-11" />) : <UndoMenu />}
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
          <ShareButton
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
