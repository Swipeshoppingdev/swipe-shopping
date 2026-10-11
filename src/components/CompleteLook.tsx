import { Check, Heart, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { universeOf } from '../config/categories'
import { STYLE_LABEL, completeLook, outfitTotal } from '../lib/outfits'
import { openProduct } from '../lib/productSheet'
import { load, save } from '../lib/storage'
import { useApp } from '../state/AppState'
import type { Product } from '../types/product'
import { PriceTag } from './PriceTag'
import { ProductImage } from './ProductImage'

/** Come gli outfit salvati nella sezione Outfit (stessa chiave): solo gli id dei capi. */
interface SavedOutfit {
  id: string
  gender: 'uomo' | 'donna'
  style: string
  items: string[]
  savedAt: number
}
export const OUTFITS_SAVED_EVENT = 'swipeshop:outfits-saved'
const euro = (n: number) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })

/** "Completa il look" nella scheda di un capo della Moda: un outfit pronto costruito attorno a quel capo. */
export function CompleteLook({ product }: { product: Product }) {
  const { allProducts, state } = useApp()
  const [variant, setVariant] = useState(0)
  const [savedIds, setSavedIds] = useState(() => load<SavedOutfit[]>('outfitsSaved', []).map((s) => s.id))
  const gender = product.gender === 'uomo' || product.gender === 'donna' ? product.gender : state.filters.gender === 'uomo' ? 'uomo' : 'donna'
  const look = useMemo(
    () => (universeOf(product.category) === 'moda' ? completeLook(product, allProducts, gender, variant) : null),
    [product, allProducts, gender, variant],
  )
  if (!look) return null
  const others = look.items.filter((p) => p.id !== product.id)
  const total = outfitTotal(look.items)
  const saved = savedIds.includes(look.id)
  const saveLook = () => {
    const list = load<SavedOutfit[]>('outfitsSaved', [])
    if (list.some((s) => s.id === look.id)) return
    const next = [{ id: look.id, gender: look.gender, style: look.style, items: look.items.map((p) => p.id), savedAt: Date.now() }, ...list]
    save('outfitsSaved', next)
    // La sezione Outfit, se è aperta sotto la scheda, rilegge i salvati.
    window.dispatchEvent(new Event(OUTFITS_SAVED_EVENT))
    setSavedIds(next.map((s) => s.id))
  }
  return (
    <div>
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <h3 className="font-semibold">Completa il look</h3>
          <p className="text-xs text-neutral-500">
            Outfit {STYLE_LABEL[look.style].toLowerCase()}
            {total !== null && ` · totale ${euro(total)}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setVariant(variant + 1)}
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-rose-500 ring-1 ring-neutral-200 active:scale-95"
        >
          <RefreshCw className="size-3.5" /> Un altro
        </button>
      </div>
      <ul className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        {others.map((p) => (
          <li key={p.id} className="w-28 shrink-0 snap-start">
            <button type="button" onClick={() => openProduct(p)} className="block w-full text-left active:scale-[0.97]">
              <span className="relative block aspect-square overflow-hidden rounded-2xl ring-1 ring-black/5">
                <ProductImage product={p} className="size-full" />
              </span>
              <span className="mt-1.5 block truncate text-[11px] font-medium tracking-wide text-neutral-500 uppercase">{p.brand}</span>
              <span className="line-clamp-2 text-xs leading-snug">{p.title}</span>
              <PriceTag product={p} />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={saveLook}
        disabled={saved}
        className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold ring-1 ring-neutral-200 active:scale-[0.98] disabled:text-neutral-500"
      >
        {saved ? (
          <>
            <Check className="size-4" /> Salvato negli outfit
          </>
        ) : (
          <>
            <Heart className="size-4 text-rose-500" /> Salva l'outfit
          </>
        )}
      </button>
    </div>
  )
}
