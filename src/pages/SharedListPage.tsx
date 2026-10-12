import { Heart } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DiscountBadge } from '../components/DiscountBadge'
import { PriceTag } from '../components/PriceTag'
import { ProductImage } from '../components/ProductImage'
import { StoreLink } from '../components/StoreLink'
import { folderLabel, isPresetFolder } from '../config/folders'
import { brandAndStore } from '../config/stores'
import { openProduct } from '../lib/productSheet'
import { sharedList } from '../lib/share'
import { routeHref } from '../lib/useHashRoute'
import { useApp } from '../state/AppState'
import type { Product } from '../types/product'

/** Cartella di preferiti ricevuta da un amico (#/lista/…): si sfoglia, si apre e si salva. */
export function SharedListPage() {
  const { state, allProducts, wishlist, actions } = useApp()
  const [list] = useState(() => sharedList())
  const byId = useMemo(() => new Map(allProducts.map((p) => [p.id, p])), [allProducts])
  const items = (list?.ids ?? []).map((id) => byId.get(id)).filter((p): p is Product => p !== undefined && p.availability !== 'out_of_stock')
  const saved = new Set(wishlist.map((w) => w.product.id))
  const missing = (list?.ids.length ?? 0) - items.length
  const allSaved = items.length > 0 && items.every((p) => saved.has(p.id))
  const loading = state.catalog.status === 'loading' || (state.catalog.status === 'ready' && state.catalog.sections.length < 2)

  if (!list) {
    return <p className="py-10 text-center text-neutral-500">Questo link non è valido.</p>
  }

  const saveAll = () => {
    for (const p of items) {
      if (saved.has(p.id)) continue
      actions.like(p)
      if (isPresetFolder(list.name)) actions.setFolder(p, list.name)
    }
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="space-y-1 pt-2">
        <p className="text-xs font-semibold tracking-wide text-rose-500 uppercase">Lista condivisa</p>
        <h1 className="text-2xl font-bold">{isPresetFolder(list.name) ? folderLabel(list.name) : 'I suoi preferiti'}</h1>
        <p className="text-sm text-neutral-500">
          {loading ? 'Caricamento prodotti…' : `${items.length} prodotti`}
          {!loading && missing > 0 && ` · ${missing} non più disponibili`}
        </p>
      </div>
      {items.length > 0 && (
        <button
          type="button"
          onClick={saveAll}
          disabled={allSaved}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-rose-500 py-3 font-semibold text-[#fff] active:scale-[0.98] disabled:opacity-60"
        >
          <Heart className="size-5 fill-current" />
          {allSaved ? 'Tutti salvati nei preferiti' : isPresetFolder(list.name) ? `Salva tutto nei preferiti, in "${list.name}"` : 'Salva tutto nei preferiti'}
        </button>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((product) => {
          const isSaved = saved.has(product.id)
          return (
            <li key={product.id} className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
              <div className="relative aspect-square">
                <button type="button" onClick={() => openProduct(product)} aria-label={`Dettagli di ${product.title}`} className="block size-full">
                  <ProductImage product={product} className="size-full" />
                </button>
                <DiscountBadge product={product} size="sm" />
                <button
                  type="button"
                  onClick={() => (isSaved ? actions.remove(product) : actions.like(product))}
                  aria-pressed={isSaved}
                  aria-label={isSaved ? `Togli ${product.title} dai preferiti` : `Salva ${product.title} nei preferiti`}
                  className="absolute top-2 right-2 grid size-9 place-items-center rounded-full bg-white/90 text-rose-500 shadow ring-1 ring-black/5 active:scale-90"
                >
                  <Heart className={`size-5 ${isSaved ? 'fill-current' : ''}`} />
                </button>
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <p className="text-[11px] font-medium tracking-wide text-neutral-500 uppercase">{brandAndStore(product)}</p>
                <h3 className="line-clamp-2 text-sm leading-snug font-medium">{product.title}</h3>
                <div className="mt-auto pt-1">
                  <PriceTag product={product} />
                </div>
                <StoreLink
                  product={product}
                  className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-full bg-neutral-900 px-3 py-2 text-sm font-semibold text-white active:scale-95"
                >
                  Acquista
                </StoreLink>
              </div>
            </li>
          )
        })}
      </ul>
      <a href={routeHref('scopri')} className="block text-center text-sm font-medium text-neutral-600 underline">
        Scopri altri prodotti con uno swipe
      </a>
    </div>
  )
}
