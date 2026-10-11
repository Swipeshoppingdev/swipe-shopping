import { useState } from 'react'
import { categoryGroupOf } from '../config/categories'
import { productImageUrl } from '../config/stores'
import type { Product } from '../types/product'

/** Foto prodotto con segnaposto elegante se manca o non si carica. */
export function ProductImage({
  product,
  eager,
  priority,
  className,
  src: srcOverride,
}: {
  product: Product
  eager?: boolean
  /** Foto più importante della pagina (la carta in cima): il browser la scarica per prima */
  priority?: boolean
  className?: string
  /** Foto diversa da quella principale (galleria) */
  src?: string
}) {
  const [failed, setFailed] = useState(false)
  const src = srcOverride ?? productImageUrl(product)
  if (!src || failed) {
    const group = categoryGroupOf(product.category)
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br from-rose-50 via-white to-amber-50 ${className ?? ''}`}>
        <span className="text-7xl drop-shadow-sm select-none" aria-hidden>
          {group?.emoji ?? '🛍️'}
        </span>
      </div>
    )
  }
  return (
    <div className={`bg-[#fff] ${className ?? ''}`}>
      <img
        src={src}
        alt={product.title}
        loading={eager || priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
        // Il widget Amazon restituisce un GIF 1x1 quando non ha l'immagine.
        onLoad={(e) => e.currentTarget.naturalWidth < 10 && setFailed(true)}
        className="size-full object-contain p-4 select-none"
      />
    </div>
  )
}
