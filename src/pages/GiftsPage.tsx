import { useMemo, useState } from 'react'
import { SwipeDeck } from '../components/SwipeDeck'
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
 * e per budget. Con "Offerte" solo i prodotti scontati, prima i più scontati. I "Sì" finiscono nei preferiti
 * della sezione del prodotto, i "No" non tornano neanche nella sua sezione.
 */
export function GiftsPage() {
  const { state, allProducts, wishlist } = useApp()
  const season = giftSeason()
  const [f, setF] = useState<GiftFilters>(() => load('giftFilters', { who: null, max: null, deals: season.deals }))
  const set = (patch: Partial<GiftFilters>) => {
    const next = { ...f, ...patch }
    setF(next)
    save('giftFilters', next)
  }

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
  const chip = (on: boolean) =>
    `h-8 shrink-0 rounded-full px-3 text-xs font-semibold ring-1 transition active:scale-95 ${
      on ? 'bg-rose-500 text-[#fff] ring-rose-500' : 'bg-white text-neutral-600 ring-neutral-200'
    }`

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      <div className="text-center leading-tight">
        <h1 className="text-xl font-black">🎄 {season.title}</h1>
        <p className="text-xs text-neutral-500">{season.hint}</p>
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]" aria-label="Per chi">
        <button type="button" aria-pressed={!f.who} onClick={() => set({ who: null })} className={chip(!f.who)}>
          Tutti
        </button>
        {WHO.map((w) => (
          <button key={w.id} type="button" aria-pressed={f.who === w.id} onClick={() => set({ who: f.who === w.id ? null : w.id })} className={chip(f.who === w.id)}>
            {w.label}
          </button>
        ))}
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]" aria-label="Budget e offerte">
        <button type="button" aria-pressed={f.deals} onClick={() => set({ deals: !f.deals })} className={chip(f.deals)}>
          % Offerte
        </button>
        {BUDGETS.map((max) => (
          <button key={max} type="button" aria-pressed={f.max === max} onClick={() => set({ max: f.max === max ? null : max })} className={chip(f.max === max)}>
            Fino a {max} €
          </button>
        ))}
      </div>
      {!ready ? (
        <div className="flex-1 animate-pulse rounded-3xl bg-neutral-200/70" aria-busy="true" />
      ) : cards.length > 0 ? (
        <SwipeDeck cards={cards} />
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
