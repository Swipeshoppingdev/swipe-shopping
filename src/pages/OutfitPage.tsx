import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion'
import { Heart, RefreshCw, Send, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { PriceTag } from '../components/PriceTag'
import { ProductImage } from '../components/ProductImage'
import { FriendPicker } from '../components/SocialBits'
import { StoreLink } from '../components/StoreLink'
import { UndoMenuView } from '../components/UndoMenu'
import { universeOf } from '../config/categories'
import { brandAndStore } from '../config/stores'
import { STYLE_LABEL, buildOutfits, outfitTotal, type Outfit, type OutfitStyle } from '../lib/outfits'
import { openProduct } from '../lib/productSheet'
import { shareList } from '../lib/share'
import { social } from '../lib/social'
import { load, save } from '../lib/storage'
import { useHashRoute } from '../lib/useHashRoute'
import { useApp } from '../state/AppState'
import { useAuth } from '../state/AuthState'
import type { Product } from '../types/product'

/** Outfit salvato: solo gli id dei capi (i dati arrivano dal catalogo aggiornato). */
interface SavedOutfit {
  id: string
  gender: 'uomo' | 'donna'
  style: OutfitStyle
  items: string[]
  savedAt: number
}

const now = () => Date.now()
const euro = (n: number) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })

/** Outfit (#/outfit): look completi composti in automatico dai capi della Moda, da swipare come i prodotti. */
export function OutfitPage() {
  const { state, allProducts, actions } = useApp()
  const moda = useMemo(() => allProducts.filter((p) => universeOf(p.category) === 'moda'), [allProducts])
  const ready = state.catalog.status === 'ready' && state.catalog.sections.includes('moda')
  const [gender, setGenderState] = useState<'uomo' | 'donna'>(() =>
    load<'uomo' | 'donna' | null>('outfitGender', null) ?? (state.filters.gender === 'uomo' ? 'uomo' : 'donna'),
  )
  const setGender = (g: 'uomo' | 'donna') => {
    setGenderState(g)
    save('outfitGender', g)
  }
  // #/outfit/salvati apre gli outfit salvati (anche dal tasto Preferiti in basso).
  const { hash } = useHashRoute()
  const tab = hash.startsWith('#/outfit/salvati') ? 'salvati' : 'scopri'
  const setTab = (t: 'scopri' | 'salvati') => window.location.replace(t === 'salvati' ? '#/outfit/salvati' : '#/outfit')
  const [saved, setSavedState] = useState(() => load<SavedOutfit[]>('outfitsSaved', []))
  const [seen, setSeenState] = useState(() => load<string[]>('outfitsSeen', []))
  const [open, setOpen] = useState<Outfit | null>(null)
  const [dir, setDir] = useState(1)
  // Le scelte fatte in questa visita, per il tasto "annulla".
  const [history, setHistory] = useState<{ id: string; yes: boolean }[]>([])
  const setSaved = (s: SavedOutfit[]) => {
    setSavedState(s)
    save('outfitsSaved', s)
  }
  const setSeen = (s: string[]) => {
    const last = s.slice(-3000)
    setSeenState(last)
    save('outfitsSeen', last)
  }

  // Colore suo (indaco) finché la pagina è aperta.
  useEffect(() => {
    document.documentElement.classList.add('outfit')
    return () => document.documentElement.classList.remove('outfit')
  }, [])

  // Gli outfit sono fatti con la Moda: la sezione aperta diventa la Moda (colori e catalogo).
  useEffect(() => {
    if (state.mode !== 'moda' && window.location.hash.startsWith('#/outfit')) actions.setMode('moda')
  }, [state.mode, actions])

  const all = useMemo(() => (ready ? buildOutfits(moda, gender) : []), [ready, moda, gender])
  const deck = useMemo(() => {
    const skip = new Set([...seen, ...saved.map((s) => s.id)])
    return all.filter((o) => !skip.has(o.id))
  }, [all, seen, saved])

  const byId = useMemo(() => new Map(moda.map((p) => [p.id, p])), [moda])
  const savedOutfits = saved.map((s) => ({ ...s, products: s.items.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])) }))

  const decide = (o: Outfit, yes: boolean) => {
    setDir(yes ? 1 : -1)
    if (yes) setSaved([{ id: o.id, gender: o.gender, style: o.style, items: o.items.map((i) => i.id), savedAt: now() }, ...saved])
    else setSeen([...seen, o.id])
    setHistory([...history.slice(-29), { id: o.id, yes }])
  }
  // Un outfit tolto da salvati/scartati torna in cima: il mazzo segue sempre lo stesso ordine.
  const undo = () => {
    const last = history.at(-1)
    if (!last) return
    setDir(-1)
    setHistory(history.slice(0, -1))
    if (last.yes) setSaved(saved.filter((s) => s.id !== last.id))
    else setSeen(seen.filter((id) => id !== last.id))
  }
  const allIds = useMemo(() => new Set(all.map((o) => o.id)), [all])
  const nos = seen.filter((id) => allIds.has(id))
  const restore = (last?: number) => {
    const back = new Set(last ? nos.slice(-last) : nos)
    setSeen(seen.filter((id) => !back.has(id)))
    setHistory(history.filter((h) => !back.has(h.id)))
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="grid grid-cols-2 gap-1 rounded-full bg-neutral-200/60 p-1">
          {(['scopri', 'salvati'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === t ? 'bg-white shadow-sm' : 'text-neutral-500'}`}
            >
              {t === 'scopri' ? 'Outfit' : `Salvati${saved.length ? ` ${saved.length}` : ''}`}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-full bg-neutral-200/60 p-1">
          {(['donna', 'uomo'] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGender(g)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold capitalize ${gender === g ? 'bg-white shadow-sm' : 'text-neutral-500'}`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {tab === 'salvati' ? (
        <Saved
          outfits={savedOutfits.filter((s) => s.gender === gender)}
          onOpen={(s) => setOpen({ id: s.id, gender: s.gender, style: s.style, items: s.products })}
          onDelete={(id) => setSaved(saved.filter((s) => s.id !== id))}
        />
      ) : !ready ? (
        <div className="flex-1 animate-pulse rounded-3xl bg-neutral-200/70" aria-busy="true" aria-label="Caricamento outfit" />
      ) : deck.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-lg font-bold">Hai visto tutti gli outfit!</p>
          <p className="text-sm text-neutral-500">Ne arrivano di nuovi quando il catalogo si aggiorna.</p>
          {seen.length > 0 && (
            <button
              type="button"
              onClick={() => setSeen(seen.filter((id) => !all.some((o) => o.id === id)))}
              className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-3 font-semibold text-white active:scale-95"
            >
              <RefreshCw className="size-4" /> Rivedi gli outfit scartati
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="relative min-h-0 flex-1">
            <AnimatePresence custom={dir}>
              {deck
                .slice(0, 2)
                .map((o, i) => <OutfitCard key={o.id} outfit={o} index={i} onDecide={(yes) => decide(o, yes)} onOpen={() => setOpen(o)} />)
                .reverse()}
            </AnimatePresence>
          </div>
          <div className="flex items-center justify-center gap-3 sm:gap-4">
            <UndoMenuView canUndo={history.length > 0} nos={nos.length} onUndo={undo} onRestore={restore} />
            <button
              type="button"
              onClick={() => decide(deck[0], false)}
              aria-label="No, scarta l'outfit"
              className="flex h-14 items-center gap-2 rounded-full bg-white px-5 font-semibold text-neutral-800 shadow-md ring-1 ring-black/5 transition active:scale-90"
            >
              <X className="size-6" strokeWidth={2.5} /> NO
            </button>
            <button
              type="button"
              onClick={() => decide(deck[0], true)}
              aria-label="Sì, salva l'outfit"
              className="flex h-14 items-center gap-2 rounded-full bg-rose-500 px-5 font-semibold text-[#fff] shadow-lg shadow-rose-500/30 transition active:scale-90"
            >
              <Heart className="size-6 fill-current" /> SÌ
            </button>
            <OutfitSend outfit={deck[0]} />
          </div>
        </>
      )}

      {open && (
        <OutfitSheet
          outfit={open}
          saved={saved.some((s) => s.id === open.id)}
          onSave={() => {
            decide(open, true)
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}

const SWIPE_DISTANCE = 110
const SWIPE_VELOCITY = 600
const cardVariants = {
  exit: (d: number) => ({
    x: d * (typeof window === 'undefined' ? 600 : window.innerWidth + 200),
    rotate: d * 22,
    opacity: 0,
    transition: { duration: 0.32, ease: 'easeOut' as const },
  }),
}

/** Card dell'outfit: si trascina come i prodotti, con "MI PIACE" e "NO" che compaiono durante lo swipe. */
function OutfitCard({ outfit, index, onDecide, onOpen }: { outfit: Outfit; index: number; onDecide: (yes: boolean) => void; onOpen: () => void }) {
  const top = index === 0
  const total = outfitTotal(outfit.items)
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-300, 0, 300], [-16, 0, 16])
  const likeOpacity = useTransform(x, [20, SWIPE_DISTANCE], [0, 1])
  const nopeOpacity = useTransform(x, [-SWIPE_DISTANCE, -20], [1, 0])
  const dragged = useRef(false)
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > SWIPE_DISTANCE || info.velocity.x > SWIPE_VELOCITY) onDecide(true)
    else if (info.offset.x < -SWIPE_DISTANCE || info.velocity.x < -SWIPE_VELOCITY) onDecide(false)
    // Il tocco che segue un trascinamento non apre la scheda.
    setTimeout(() => (dragged.current = false), 0)
  }
  const open = () => !dragged.current && top && onOpen()
  return (
    <motion.div
      className="absolute inset-0 flex flex-col overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-black/5"
      style={{ x, rotate, zIndex: 10 - index, touchAction: top ? 'pan-y' : undefined }}
      drag={top ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.9}
      onDragStart={() => (dragged.current = true)}
      onDragEnd={onDragEnd}
      initial={{ scale: 0.94, y: 14, opacity: 0 }}
      animate={{ scale: 1 - index * 0.04, y: index * 14, opacity: 1 }}
      exit="exit"
      variants={cardVariants}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      aria-hidden={!top}
    >
      <div onClick={open} className="relative min-h-0 flex-1 cursor-pointer bg-neutral-100 p-1.5" aria-label="Vedi i capi dell'outfit">
        <Collage items={outfit.items} eager={top} />
        <motion.span
          style={{ opacity: likeOpacity }}
          className="pointer-events-none absolute top-6 left-5 -rotate-12 rounded-xl border-4 border-rose-500 bg-rose-500 px-3 py-1 text-2xl font-black tracking-wide text-[#fff] shadow-lg"
        >
          MI PIACE
        </motion.span>
        <motion.span
          style={{ opacity: nopeOpacity }}
          className="pointer-events-none absolute top-6 right-5 rotate-12 rounded-xl border-4 border-[#262626] bg-[#fff]/90 px-3 py-1 text-2xl font-black tracking-wide text-[#262626]"
        >
          NO
        </motion.span>
      </div>
      <div onClick={open} className="flex cursor-pointer items-center justify-between gap-3 p-4">
        <span>
          <span className="block text-xs font-semibold tracking-wide text-neutral-500 uppercase">
            Outfit {STYLE_LABEL[outfit.style].toLowerCase()} · {outfit.items.length} capi
          </span>
          <span className="block text-lg font-bold">{total !== null ? `Totale ${euro(total)}` : 'Vedi i prezzi'}</span>
        </span>
        <span className="shrink-0 text-sm font-semibold text-rose-500 underline">Vedi capi</span>
      </div>
    </motion.div>
  )
}

/** Le foto dei capi affiancate: a sinistra i capi principali, a destra scarpe e accessori. */
function Collage({ items, eager }: { items: Product[]; eager?: boolean }) {
  const split = items.length <= 3 ? 1 : 2
  const cols = [items.slice(0, split), items.slice(split)]
  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1.5">
      {cols.map((col, c) => (
        <div key={c} className="flex min-h-0 min-w-0 flex-col gap-1.5">
          {col.map((p) => (
            <ProductImage
              key={p.id}
              product={p}
              eager={eager}
              className="relative min-h-0 flex-1 overflow-hidden rounded-2xl [&_img]:absolute [&_img]:inset-0 [&_img]:h-full [&_img]:w-full [&_img]:object-contain [&_img]:p-2 [&_span]:text-4xl"
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function OutfitSheet({ outfit, saved, onSave, onClose }: { outfit: Outfit; saved: boolean; onSave: () => void; onClose: () => void }) {
  const { wishlist, actions } = useApp()
  const total = outfitTotal(outfit.items)
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Capi dell'outfit"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:rounded-3xl"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Outfit {STYLE_LABEL[outfit.style].toLowerCase()}</p>
            <p className="text-xl font-bold">{total !== null ? `Totale ${euro(total)}` : `${outfit.items.length} capi`}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Chiudi" className="grid size-9 place-items-center rounded-full bg-neutral-100">
            <X className="size-5" />
          </button>
        </div>
        {outfit.items.length === 0 && <p className="py-6 text-center text-sm text-neutral-500">I capi di questo outfit non sono più disponibili.</p>}
        <ul className="space-y-3">
          {outfit.items.map((p) => {
            const liked = wishlist.some((w) => w.product.id === p.id)
            return (
              <li key={p.id} className="flex gap-3 rounded-2xl p-2 ring-1 ring-neutral-100">
                <button type="button" onClick={() => openProduct(p)} className="shrink-0">
                  <ProductImage product={p} className="size-24 overflow-hidden rounded-xl [&_img]:h-full [&_img]:w-full [&_img]:object-contain [&_span]:text-3xl" />
                </button>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <button type="button" onClick={() => openProduct(p)} className="text-left">
                    <p className="truncate text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">{brandAndStore(p)}</p>
                    <p className="line-clamp-2 text-sm font-medium">{p.title}</p>
                  </button>
                  <PriceTag product={p} />
                  <div className="mt-auto flex items-center gap-2">
                    <StoreLink product={p} className="inline-flex items-center gap-1 rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white">
                      Acquista
                    </StoreLink>
                    <button
                      type="button"
                      onClick={() => (liked ? actions.remove(p) : actions.like(p))}
                      aria-label={liked ? 'Togli dai preferiti' : 'Salva nei preferiti'}
                      aria-pressed={liked}
                      className="grid size-8 place-items-center rounded-full ring-1 ring-neutral-200"
                    >
                      <Heart className={`size-4 ${liked ? 'fill-rose-500 text-rose-500' : ''}`} />
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
        {!saved && outfit.items.length > 0 && (
          <button
            type="button"
            onClick={() => {
              onSave()
              onClose()
            }}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-rose-500 py-3 font-semibold text-[#fff] active:scale-[0.98]"
          >
            <Heart className="size-5 fill-current" /> Salva l'outfit
          </button>
        )}
      </div>
    </div>
  )
}

function Saved(props: {
  outfits: (SavedOutfit & { products: Product[] })[]
  onOpen: (s: SavedOutfit & { products: Product[] }) => void
  onDelete: (id: string) => void
}) {
  if (props.outfits.length === 0) {
    return <p className="py-10 text-center text-sm text-neutral-500">Gli outfit a cui dici sì finiscono qui.</p>
  }
  return (
    <div className="grid grid-cols-2 gap-3 pb-4">
      {props.outfits.map((s) => {
        const total = outfitTotal(s.products)
        return (
          <div key={s.id} className="relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
            <button type="button" onClick={() => props.onOpen(s)} className="block w-full text-left">
              <div className="aspect-square bg-neutral-100 p-1">
                <Collage items={s.products} />
              </div>
              <p className="px-3 pt-2 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">{STYLE_LABEL[s.style]}</p>
              <p className="px-3 pb-3 text-sm font-bold">{total !== null ? euro(total) : `${s.products.length} capi`}</p>
            </button>
            <button
              type="button"
              onClick={() => props.onDelete(s.id)}
              aria-label="Elimina outfit"
              className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-white/90 text-neutral-600 shadow ring-1 ring-black/5"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

/** Tasto "manda" degli outfit: agli amici arrivano in chat i capi dell'outfit; fuori dall'app va il link della lista. */
function OutfitSend({ outfit }: { outfit: Outfit }) {
  const auth = useAuth()
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState('')
  const flash = (text: string) => {
    setToast(text)
    setTimeout(() => setToast(''), 2000)
  }
  const name = `Outfit ${STYLE_LABEL[outfit.style].toLowerCase()}`
  const shareOutside = async () => {
    setOpen(false)
    if ((await shareList(name, outfit.items)) === 'copied') flash('Link copiato')
  }
  return (
    <>
      <button
        type="button"
        aria-label="Manda l'outfit"
        title="Manda a un amico"
        onClick={() => (auth.user ? setOpen(true) : void shareOutside())}
        className="relative grid size-11 place-items-center rounded-full bg-white text-neutral-600 shadow-md ring-1 ring-black/5 transition active:scale-90"
      >
        <Send className="size-5" />
        {toast && (
          <span className="absolute -top-8 left-1/2 -translate-x-1/2 rounded-full bg-neutral-900 px-2 py-1 text-xs whitespace-nowrap text-white">
            {toast}
          </span>
        )}
      </button>
      {open && (
        <FriendPicker
          title="Manda l'outfit a…"
          confirmLabel={`Manda ${outfit.items.length} capi`}
          onClose={() => setOpen(false)}
          onConfirm={async (codes) => {
            // In chat arrivano i capi, uno per messaggio.
            let n = 0
            for (const p of outfit.items) n = await social.send(codes, 'consiglio', { productId: p.id })
            setOpen(false)
            flash(n === 1 ? 'Inviato!' : `Inviato a ${n}!`)
          }}
          extra={
            <button type="button" onClick={shareOutside} className="mt-3 w-full text-center text-sm font-medium text-neutral-600 underline">
              Condividi con altre app
            </button>
          }
        />
      )}
    </>
  )
}
