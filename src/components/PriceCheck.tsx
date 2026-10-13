import { useMemo } from 'react'
import { categoryLabel } from '../config/categories'
import { formatPrice } from '../lib/price'
import { cheaperAlternatives, priceRank } from '../lib/priceCheck'
import { openProduct } from '../lib/productSheet'
import type { Product } from '../types/product'
import { useApp } from '../state/AppState'
import { PriceTag } from './PriceTag'
import { ProductImage } from './ProductImage'

// Solo colori che il tema scuro ridefinisce (src/index.css), così si leggono in entrambi i temi.
const STYLE = {
  basso: { box: 'bg-emerald-50 text-emerald-800 ring-emerald-200', pill: 'bg-[#059669]', dot: 'bg-emerald-500', title: 'Buon prezzo' },
  medio: { box: 'bg-neutral-100 text-neutral-800 ring-neutral-200', pill: 'bg-[#525252]', dot: 'bg-amber-400', title: 'Prezzo nella media' },
  alto: { box: 'bg-amber-50 text-amber-900 ring-amber-200', pill: 'bg-[#d97706]', dot: 'bg-amber-500', title: 'Tra i più cari' },
}

/** Etichetta sulla foto della carta, accanto allo sconto; la spiegazione è nella scheda. Colori fissi: la foto è sempre su bianco. */
export function PriceRankPill({ product }: { product: Product }) {
  const { allProducts } = useApp()
  const rank = useMemo(() => priceRank(product, allProducts), [product, allProducts])
  if (!rank) return null
  const s = STYLE[rank.level]
  return <span className={`rounded-full px-3 py-1.5 text-sm font-bold text-[#fff] shadow-lg ${s.pill}`}>{s.title}</span>
}

/** "Prezzo giusto?": dove sta questo prezzo rispetto ai prodotti simili di oggi. */
export function PriceRankBadge({ product, all }: { product: Product; all: Product[] }) {
  const rank = useMemo(() => priceRank(product, all), [product, all])
  if (!rank) return null
  const s = STYLE[rank.level]
  const cat = categoryLabel(product.category).toLowerCase()
  const text =
    rank.level === 'alto'
      ? `Costa più del ${100 - rank.cheaperThan}% dei prodotti simili in ${cat}.`
      : `Costa meno del ${rank.cheaperThan}% dei prodotti simili in ${cat}.`
  return (
    <div className={`flex items-start gap-2.5 rounded-2xl px-3.5 py-2.5 text-sm ring-1 ${s.box}`}>
      <span aria-hidden className={`mt-1.5 size-2.5 shrink-0 rounded-full ${s.dot}`} />
      <span>
        <strong>{s.title}</strong> · {text}
        <span className="block text-xs opacity-70">Confronto con {rank.peers.toLocaleString('it-IT')} prezzi controllati oggi</span>
      </span>
    </div>
  )
}

/** "Simile ma costa meno": fino a 3 alternative più economiche, con quanto si risparmia. */
export function CheaperAlternatives({ list }: { list: ReturnType<typeof cheaperAlternatives> }) {
  if (list.length === 0) return null
  return (
    <div>
      <h3 className="mb-2 font-semibold">Simile ma costa meno</h3>
      <ul className="space-y-2">
        {list.map(({ product: p, saving }) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => openProduct(p)}
              className="flex w-full items-center gap-3 rounded-2xl bg-white p-2 text-left ring-1 ring-neutral-200 active:scale-[0.99]"
            >
              <span className="size-16 shrink-0 overflow-hidden rounded-xl bg-[#fff] ring-1 ring-black/5">
                <ProductImage product={p} className="size-full" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-medium tracking-wide text-neutral-500 uppercase">{p.brand}</span>
                <span className="line-clamp-1 text-sm leading-snug">{p.title}</span>
                <PriceTag product={p} />
              </span>
              <span className="shrink-0 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold text-[#fff]">−{formatPrice(saving)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
