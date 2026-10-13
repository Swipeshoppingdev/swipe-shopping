import { Check, Plus } from 'lucide-react'
import { storeName } from '../config/stores'
import { isFollowed, toggleFollow, useFollows } from '../lib/follows'
import type { Product } from '../types/product'

/** "Segui" sulla marca del prodotto: le sue novità escono più spesso nel mazzo e arriva un avviso. */
export function FollowBrand({ product }: { product: Product }) {
  const follows = useFollows()
  const brand = product.brand?.trim()
  if (!brand || brand.toLowerCase() === storeName(product.store).toLowerCase()) return null
  const on = isFollowed(brand, follows)
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Segui già ${brand}: tocca per smettere` : `Segui ${brand}`}
      onClick={() => toggleFollow(brand)}
      className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold ${
        on ? 'bg-neutral-100 text-neutral-700' : 'bg-neutral-900 text-white'
      }`}
    >
      {on ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
      {on ? 'Segui già' : 'Segui'}
    </button>
  )
}
