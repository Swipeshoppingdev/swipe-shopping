import { AnimatePresence, motion } from 'framer-motion'
import { BadgePercent } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { universeOf } from '../config/categories'
import { dropDay } from '../lib/drop'
import { formatPrice, freshPrice } from '../lib/price'
import { load, save } from '../lib/storage'
import { routeHref } from '../lib/useHashRoute'
import { useApp } from '../state/AppState'
import { ProductImage } from './ProductImage'
import { StoreLink } from './StoreLink'

/**
 * "Oggi nei tuoi preferiti": una volta al giorno per sezione, all'apertura, se qualche preferito è in offerta
 * (sconto vero di oggi) compare prima del mazzo con il link diretto al negozio.
 */
export function FavDeals() {
  const { state, wishlist } = useApp()
  const key = `favDealsSeen:${state.mode}`
  const today = dropDay()
  const [closed, setClosed] = useState(() => load<string>(key, '') === today)
  const all = useMemo(
    () =>
      wishlist
        .filter((w) => w.inCatalog && w.deal !== null && universeOf(w.product.category) === state.mode && freshPrice(w.product))
        .sort((a, b) => (b.deal ?? 0) - (a.deal ?? 0)),
    [wishlist, state.mode],
  )
  // Solo i preferiti già in offerta all'apertura: un Sì dato adesso a un prodotto scontato non lo fa comparire.
  const atOpen = useRef<Set<string> | null>(null)
  if (atOpen.current === null) atOpen.current = new Set(all.map((w) => w.product.id))
  const deals = all.filter((w) => atOpen.current!.has(w.product.id))
  const close = () => setClosed(true)
  const show = !closed && deals.length > 0
  // Vista oggi: riaprendo l'app non ricompare fino a domani (alle 8, come il drop).
  useEffect(() => {
    if (show) save(key, today)
  }, [show, key, today])
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-label="Oggi nei tuoi preferiti"
          className="absolute inset-0 z-30 flex flex-col gap-3 rounded-3xl bg-neutral-50 p-1"
        >
          <div className="pt-1 text-center">
            <p className="flex items-center justify-center gap-2 text-xl font-black">
              <BadgePercent className="size-5 text-emerald-600" /> Oggi nei tuoi preferiti
            </p>
            <p className="text-sm text-neutral-500">
              {deals.length === 1 ? 'Un prodotto che hai salvato è in offerta' : `${deals.length} prodotti che hai salvato sono in offerta`}
            </p>
          </div>
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {deals.slice(0, 4).map(({ product, deal }) => {
              const fp = freshPrice(product)!
              return (
                <li key={product.id} className="flex items-center gap-3 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-black/5">
                  <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-[#fff]">
                    <ProductImage product={product} className="size-full object-contain p-1" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium">{product.title}</p>
                    <p className="text-sm">
                      <strong>{formatPrice(fp.price)}</strong>{' '}
                      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs font-bold text-emerald-800">-{deal}%</span>
                    </p>
                  </div>
                  <StoreLink
                    product={product}
                    icon={false}
                    className="shrink-0 rounded-full bg-neutral-900 px-3.5 py-2 text-sm font-semibold text-white active:scale-95"
                  >
                    Vedi
                  </StoreLink>
                </li>
              )
            })}
          </ul>
          <div className="flex justify-center gap-2 pb-1">
            {deals.length > 4 && (
              <a href={routeHref('preferiti')} onClick={close} className="flex h-11 items-center rounded-full bg-white px-5 text-sm font-semibold ring-1 ring-neutral-200 active:scale-95">
                Tutti i {deals.length}
              </a>
            )}
            <button type="button" onClick={close} className="h-11 rounded-full bg-rose-500 px-6 text-sm font-semibold text-[#fff] active:scale-95">
              Continua a scoprire
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
