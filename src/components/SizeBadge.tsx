import { fitSizes } from '../lib/sizes'
import { useApp } from '../state/AppState'
import type { Product } from '../types/product'

/** "Taglia M ✓" in basso a destra sulla foto, quando la taglia scelta nei filtri risulta disponibile. */
export function SizeBadge({ product }: { product: Product }) {
  const { state } = useApp()
  // Solo con l'elenco completo delle taglie (sizesAt): dal titolo si vede una sola variante.
  const fit = product.sizesAt ? fitSizes(product.sizes, state.filters.sizes) : []
  if (!fit.length) return null
  return (
    <span className="pointer-events-none absolute right-3 bottom-3 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold text-[#fff] shadow">
      Taglia {fit.slice(0, 2).join(', ')} ✓
    </span>
  )
}
