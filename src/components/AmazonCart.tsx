import { ShoppingCart } from 'lucide-react'
import { amazonCartUrl } from '../config/stores'
import { track } from '../lib/analytics'
import type { Product } from '../types/product'

/** "Aggiungi tutto al carrello Amazon": un tocco per tutti i capi di un outfit o dei preferiti. */
export function AmazonCart({ products, className = '' }: { products: Product[]; className?: string }) {
  const cart = amazonCartUrl(products)
  if (!cart) return null
  return (
    <div className={className}>
      <a
        href={cart.url}
        target="_blank"
        rel="noopener noreferrer sponsored nofollow"
        onClick={() => products.forEach((p) => p.store === 'amazon' && track('click', p))}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-neutral-900 px-4 font-semibold text-white active:scale-[0.98]"
      >
        <ShoppingCart className="size-5 shrink-0" />
        Aggiungi tutto al carrello Amazon ({cart.count})
      </a>
      <p className="mt-1.5 text-center text-xs text-neutral-500">Su Amazon controlla taglie e colori nel carrello prima di pagare.</p>
    </div>
  )
}
