import { Gift, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { PriceTag } from '../components/PriceTag'
import { ProductImage } from '../components/ProductImage'
import { StoreLink } from '../components/StoreLink'
import { SwipeDeck } from '../components/SwipeDeck'
import { brandAndStore } from '../config/stores'
import { openProduct } from '../lib/productSheet'
import { useHashRoute } from '../lib/useHashRoute'
import { universeOf, type Universe } from '../config/categories'
import { modelKey, onePerModel } from '../lib/dedupe'
import { sortProducts } from '../lib/filters'
import { discountBadge, freshPrice } from '../lib/price'
import { load, save } from '../lib/storage'
import { useApp } from '../state/AppState'
import type { Product } from '../types/product'

/** Titolo del periodo: Black Friday dal 20 novembre al Cyber Monday, poi Natale fino al 24 dicembre. */
export function giftSeason(now = new Date()) {
  const m = now.getMonth() + 1
  const d = now.getDate()
  if ((m === 11 && d >= 20) || (m === 12 && d <= 1)) return { title: 'Black Friday', hint: 'Le offerte più forti di tutte le sezioni', deals: true }
  if (m === 12 && d <= 24) return { title: 'Regali di Natale', hint: 'Idee regalo per tutti, per budget', deals: false }
  if (m === 11 || m === 10) return { title: 'Idee regalo', hint: 'Black Friday e Natale: inizia a salvare le idee', deals: false }
  return { title: 'Idee regalo', hint: 'Regali per tutti, per budget', deals: false }
}

type Who = 'lei' | 'lui' | 'tech' | 'casa' | 'gadget' | 'golosi' | 'animali'
const WHO: { id: Who; label: string; fits: (p: Product, u: Universe) => boolean }[] = [
  { id: 'lei', label: '👩 Per lei', fits: (p, u) => (u === 'moda' || u === 'beauty') && p.gender !== 'uomo' },
  { id: 'lui', label: '👨 Per lui', fits: (p, u) => (u === 'moda' || u === 'beauty') && p.gender !== 'donna' },
  { id: 'tech', label: '🎧 Tech', fits: (_, u) => u === 'tech' },
  { id: 'casa', label: '🏠 Casa', fits: (_, u) => u === 'casa' },
  { id: 'gadget', label: '🎁 Curiosi', fits: (_, u) => u === 'gadget' },
  { id: 'golosi', label: '🍫 Golosi', fits: (_, u) => u === 'snack' },
  { id: 'animali', label: '🐾 Animali', fits: (_, u) => u === 'animali' },
]
const BUDGETS = [20, 50, 100]
const SEED = 'regali'

interface GiftFilters {
  who: Who | null
  max: number | null
  deals: boolean
}

/**
 * Regali (#/regali, dal menu Sezioni): un mazzo con i prodotti di tutte le sezioni, scelti per chi li riceve
 * e per budget. Con "Offerte" solo i prodotti scontati, prima i più scontati. Come Outfit ha la sua barra:
 * #/regali/salvati (i "Sì" dati qui, che restano anche nei preferiti della sezione del prodotto) e #/regali/filtri.
 */
export function GiftsPage() {
  const { state, allProducts, wishlist, actions } = useApp()
  const { hash } = useHashRoute()
  const tab = hash.startsWith('#/regali/salvati') ? 'salvati' : hash.startsWith('#/regali/filtri') ? 'filtri' : 'scopri'
  const season = giftSeason()
  const [f, setF] = useState<GiftFilters>(() => load('giftFilters', { who: null, max: null, deals: season.deals }))
  const set = (patch: Partial<GiftFilters>) => {
    const next = { ...f, ...patch }
    setF(next)
    save('giftFilters', next)
  }
  const [liked, setLiked] = useState(() => load<string[]>('giftsLiked', []))
  const onLike = useCallback((p: Product) => {
    setLiked((prev) => {
      const next = [p.id, ...prev.filter((id) => id !== p.id)].slice(0, 500)
      save('giftsLiked', next)
      return next
    })
  }, [])

  const cards = useMemo(() => {
    const seen = new Set([...state.disliked, ...wishlist.map((w) => w.product.id)])
    const who = WHO.find((w) => w.id === f.who)
    const list = allProducts.filter((p) => {
      if (p.availability === 'out_of_stock' || seen.has(p.id) || p.searchQuery) return false
      const price = freshPrice(p)?.price
      // Un regalo senza prezzo verificato non si può scegliere per budget: fuori.
      if (price === undefined || (f.max !== null && price > f.max)) return false
      if (f.deals && discountBadge(p) === null) return false
      return !who || who.fits(p, universeOf(p.category))
    })
    let sorted = sortProducts(list, 'mix', SEED)
    // Offerte: prima gli sconti più forti (a fasce di 10%, mescolati dentro la fascia).
    if (f.deals) {
      const band = (p: Product) => Math.floor((discountBadge(p) ?? 0) / 10)
      sorted = [...sorted].sort((a, b) => band(b) - band(a))
    }
    const seenModels = new Set(wishlist.map((w) => modelKey(w.product as Product)))
    return onePerModel(sorted, seenModels)
  }, [allProducts, state.disliked, wishlist, f])

  const ready = state.catalog.status === 'ready'
  const summary = [
    WHO.find((w) => w.id === f.who)?.label.replace(/^\S+\s/, '').toLowerCase(),
    f.max !== null && `fino a ${f.max} €`,
    f.deals && 'in offerta',
  ].filter(Boolean)

  if (tab === 'filtri') return <GiftFiltersTab f={f} set={set} count={ready ? cards.length : null} />
  if (tab === 'salvati') {
    const saved = liked.map((id) => wishlist.find((w) => w.product.id === id)?.product).filter((p): p is Product => !!p)
    return <GiftsSaved products={saved} onRemove={(p) => actions.remove(p)} />
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 leading-tight">
          <h1 className="truncate text-xl font-black">🎄 {season.title}</h1>
          <p className="truncate text-xs text-neutral-500">{summary.length ? `Regali ${summary.join(', ')}` : season.hint}</p>
        </div>
        <a
          href="#/regali/filtri"
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-rose-500 px-3.5 text-sm font-semibold text-[#fff] active:scale-95"
        >
          <SlidersHorizontal className="size-4" /> Per chi
        </a>
      </div>
      {!ready ? (
        <div className="flex-1 animate-pulse rounded-3xl bg-neutral-200/70" aria-busy="true" />
      ) : cards.length > 0 ? (
        <SwipeDeck cards={cards} onLike={onLike} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="text-5xl" aria-hidden>
            🎁
          </div>
          <h2 className="text-xl font-semibold">Nessun regalo con queste scelte</h2>
          <p className="text-neutral-500">Prova un budget più alto o togli "Offerte".</p>
          <button
            type="button"
            onClick={() => set({ who: null, max: null, deals: false })}
            className="rounded-full bg-neutral-900 px-5 py-3 font-semibold text-white active:scale-95"
          >
            Mostra tutti i regali
          </button>
        </div>
      )}
    </div>
  )
}

const chip = (on: boolean) =>
  `h-9 rounded-full px-3.5 text-sm font-semibold ring-1 transition active:scale-95 ${
    on ? 'bg-rose-500 text-[#fff] ring-rose-500' : 'bg-white text-neutral-700 ring-neutral-200'
  }`

/** Filtri di Regali (#/regali/filtri): per chi, budget e offerte. Le scelte valgono subito. */
function GiftFiltersTab({ f, set, count }: { f: GiftFilters; set: (p: Partial<GiftFilters>) => void; count: number | null }) {
  return (
    <div className="space-y-6 py-2">
      <h1 className="text-2xl font-bold">Filtri regali</h1>
      <section className="space-y-2.5">
        <h2 className="font-semibold">Per chi</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={!f.who} onClick={() => set({ who: null })} className={chip(!f.who)}>
            Tutti
          </button>
          {WHO.map((w) => (
            <button key={w.id} type="button" aria-pressed={f.who === w.id} onClick={() => set({ who: f.who === w.id ? null : w.id })} className={chip(f.who === w.id)}>
              {w.label}
            </button>
          ))}
        </div>
      </section>
      <section className="space-y-2.5">
        <h2 className="font-semibold">Budget</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={f.max === null} onClick={() => set({ max: null })} className={chip(f.max === null)}>
            Qualsiasi
          </button>
          {BUDGETS.map((max) => (
            <button key={max} type="button" aria-pressed={f.max === max} onClick={() => set({ max: f.max === max ? null : max })} className={chip(f.max === max)}>
              Fino a {max} €
            </button>
          ))}
        </div>
      </section>
      <section className="space-y-2.5">
        <h2 className="font-semibold">Offerte</h2>
        <button type="button" aria-pressed={f.deals} onClick={() => set({ deals: !f.deals })} className={chip(f.deals)}>
          % Solo prodotti in offerta
        </button>
      </section>
      <a
        href="#/regali"
        className="flex h-12 items-center justify-center rounded-full bg-rose-500 font-semibold text-[#fff] shadow-md active:scale-95"
      >
        {count === null ? 'Mostra i regali' : count === 0 ? 'Nessun regalo: cambia le scelte' : `Mostra ${count.toLocaleString('it-IT')} regali`}
      </a>
    </div>
  )
}

/** Regali salvati (#/regali/salvati): i "Sì" dati in Regali, ancora nei preferiti. */
function GiftsSaved({ products, onRemove }: { products: Product[]; onRemove: (p: Product) => void }) {
  if (!products.length)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <Gift className="size-12 text-rose-300" />
        <h2 className="text-xl font-semibold">Nessun regalo salvato</h2>
        <p className="text-neutral-500">Scorri a destra sulle idee regalo che ti piacciono: le ritrovi qui.</p>
        <a href="#/regali" className="mt-2 rounded-full bg-neutral-900 px-5 py-3 font-semibold text-white">
          Scopri i regali
        </a>
      </div>
    )
  return (
    <div className="space-y-4 py-2">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Regali salvati</h1>
        <span className="text-sm text-neutral-500">{products.length}</span>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {products.map((p) => (
          <li key={p.id} className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200">
            <div className="relative">
              <button type="button" onClick={() => openProduct(p)} className="block w-full bg-white" aria-label={`Apri ${p.title}`}>
                <ProductImage product={p} className="aspect-square w-full object-contain p-2" />
              </button>
              <button
                type="button"
                onClick={() => onRemove(p)}
                aria-label={`Rimuovi ${p.title}`}
                className="absolute top-2 right-2 grid size-9 place-items-center rounded-full bg-white/90 text-neutral-600 shadow ring-1 ring-black/5 active:scale-90"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
            <div className="flex flex-1 flex-col gap-1 p-3">
              <p className="text-[11px] font-medium tracking-wide text-neutral-500 uppercase">{brandAndStore(p)}</p>
              <h3 className="line-clamp-2 text-sm leading-snug font-medium">{p.title}</h3>
              <div className="mt-auto pt-1">
                <PriceTag product={p} />
              </div>
              <StoreLink product={p} className="mt-2 inline-flex items-center justify-center rounded-full bg-neutral-900 px-3 py-2 text-sm font-semibold text-white active:scale-95">
                Acquista
              </StoreLink>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-center text-xs text-neutral-500">Li trovi anche nei Preferiti della loro sezione.</p>
    </div>
  )
}
