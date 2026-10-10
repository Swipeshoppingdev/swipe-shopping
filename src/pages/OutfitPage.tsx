import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
import { Heart, RefreshCw, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { PriceTag } from '../components/PriceTag'
import { ProductImage } from '../components/ProductImage'
import { StoreLink } from '../components/StoreLink'
import { universeOf } from '../config/categories'
import { brandAndStore } from '../config/stores'
import { STYLE_LABEL, buildOutfits, outfitTotal, type Outfit, type OutfitStyle } from '../lib/outfits'
import { openProduct } from '../lib/productSheet'
import { load, save } from '../lib/storage'
import { useApp } from '../state/AppState'
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
  const [tab, setTab] = useState<'scopri' | 'salvati'>('scopri')
  const [saved, setSavedState] = useState(() => load<SavedOutfit[]>('outfitsSaved', []))
  const [seen, setSeenState] = useState(() => load<string[]>('outfitsSeen', []))
  const [open, setOpen] = useState<Outfit | null>(null)
  const [dir, setDir] = useState(1)
  const setSaved = (s: SavedOutfit[]) => {
    setSavedState(s)
    save('outfitsSaved', s)
  }
  const setSeen = (s: string[]) => {
    const last = s.slice(-3000)
    setSeenState(last)
    save('outfitsSeen', last)
  }

  // Gli outfit sono fatti con la Moda: la sezione aperta diventa la Moda (colori e catalogo).
  useEffect(() => {
    if (state.mode !== 'moda') actions.setMode('moda')
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
                .map((o, i) => <OutfitCard key={o.id} outfit={o} top={i === 0} onDecide={(yes) => decide(o, yes)} onOpen={() => setOpen(o)} />)
                .reverse()}
            </AnimatePresence>
          </div>
          <div className="flex items-center justify-center gap-3">
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

function OutfitCard({ outfit, top, onDecide, onOpen }: { outfit: Outfit; top: boolean; onDecide: (yes: boolean) => void; onOpen: () => void }) {
  const total = outfitTotal(outfit.items)
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) < 110 && Math.abs(info.velocity.x) < 600) return
    onDecide(info.offset.x > 0)
  }
  return (
    <motion.div
      className="absolute inset-0 flex flex-col overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-black/5"
      style={{ zIndex: top ? 2 : 1 }}
      initial={{ scale: 0.96, opacity: 0 }}
      animate={{ scale: top ? 1 : 0.96, opacity: 1, y: top ? 0 : 8 }}
      variants={{ exit: (d: number) => ({ x: d * 500, rotate: d * 15, opacity: 0, transition: { duration: 0.25 } }) }}
      exit="exit"
      drag={top ? 'x' : false}
      dragSnapToOrigin
      whileDrag={{ rotate: 0 }}
      onDragEnd={onDragEnd}
    >
      <button type="button" onClick={onOpen} className="min-h-0 flex-1 bg-neutral-100 p-1.5" aria-label="Vedi i capi dell'outfit">
        <Collage items={outfit.items} eager={top} />
      </button>
      <button type="button" onClick={onOpen} className="flex items-center justify-between gap-3 p-4 text-left">
        <span>
          <span className="block text-xs font-semibold tracking-wide text-neutral-500 uppercase">
            Outfit {STYLE_LABEL[outfit.style].toLowerCase()} · {outfit.items.length} capi
          </span>
          <span className="block text-lg font-bold">{total !== null ? `Totale ${euro(total)}` : 'Vedi i prezzi'}</span>
        </span>
        <span className="shrink-0 text-sm font-semibold text-rose-500 underline">Vedi capi</span>
      </button>
    </motion.div>
  )
}

/** Le foto dei capi affiancate: a sinistra i capi principali, a destra scarpe e accessori. */
function Collage({ items, eager }: { items: Product[]; eager?: boolean }) {
  const split = items.length <= 3 ? 1 : 2
  const cols = [items.slice(0, split), items.slice(split)]
  return (
    <div className="grid h-full grid-cols-2 gap-1.5">
      {cols.map((col, c) => (
        <div key={c} className="flex min-h-0 flex-col gap-1.5">
          {col.map((p) => (
            <ProductImage
              key={p.id}
              product={p}
              eager={eager}
              className="min-h-0 flex-1 overflow-hidden rounded-2xl [&_img]:h-full [&_img]:w-full [&_img]:object-contain [&_img]:p-2 [&_span]:text-4xl"
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
    return <p className="py-10 text-center text-sm text-neutral-500">Gli outfit che ti piacciono (Sì) finiscono qui.</p>
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
