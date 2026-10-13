import { AnimatePresence, motion } from 'framer-motion'
import { Check, Heart, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { categoryLabel } from '../config/categories'
import { brandAndStore, storeLinkLabel, storeName } from '../config/stores'
import { galleryOf } from '../lib/gallery'
import { closeProduct, openProduct, useOpenProduct } from '../lib/productSheet'
import { hasSizes } from '../lib/sizes'
import { formatPrice, freshPrice } from '../lib/price'
import { similarProducts } from '../lib/similar'
import { useDetails } from '../lib/useDetails'
import { useApp } from '../state/AppState'
import type { Product } from '../types/product'
import { CompleteLook } from './CompleteLook'
import { DiscountBadge } from './DiscountBadge'
import { NewBadge } from './NewBadge'
import { PriceTag } from './PriceTag'
import { ProductImage } from './ProductImage'
import { ReportProduct } from './ReportProduct'
import { ShareButton } from './ShareButton'
import { SendToFriends } from './SocialBits'
import { StoreLink } from './StoreLink'

/** Scheda prodotto a tutto schermo: più foto, caratteristiche e pulsanti. */
export function ProductSheet() {
  const product = useOpenProduct()
  const panel = useRef<HTMLDivElement>(null)
  const drag = useRef<HTMLDivElement>(null)
  useSwipeDown(panel, drag, !!product)
  // Aprendo un prodotto simile si riparte dall'alto della scheda.
  useEffect(() => panel.current?.scrollTo({ top: 0 }), [product?.id])

  useEffect(() => {
    if (!product) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeProduct()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [product])

  return (
    <AnimatePresence>
      {product && (
        <motion.div
          key="sheet"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeProduct}
        >
          <motion.div
            className="w-full max-w-md"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div ref={drag}>
              <div
                ref={panel}
                role="dialog"
                aria-modal="true"
                aria-label={product.title}
                className="relative max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-white pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl"
              >
                {/* Maniglia: la scheda si chiude anche trascinandola verso il basso. */}
                <div aria-hidden className="absolute top-2 left-1/2 z-20 h-1.5 w-10 -translate-x-1/2 rounded-full bg-neutral-300/90" />
                <SheetContent key={product.id} product={product} />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * Trascinando la scheda verso il basso (quando è già in cima) la si chiude, come nelle app.
 * Listener nativi con passive: false, così si blocca lo scorrimento della pagina mentre si trascina.
 */
function useSwipeDown(panel: React.RefObject<HTMLDivElement | null>, drag: React.RefObject<HTMLDivElement | null>, open: boolean) {
  useEffect(() => {
    const el = panel.current
    const box = drag.current
    if (!open || !el || !box) return
    let startY = 0
    let startX = 0
    let startAt = 0
    let dy = 0
    let active = false
    let decided = false
    const set = (y: number, animate: boolean) => {
      box.style.transition = animate ? 'transform 0.25s ease-out' : 'none'
      box.style.transform = y ? `translateY(${y}px)` : ''
    }
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      startY = e.touches[0].clientY
      startX = e.touches[0].clientX
      startAt = Date.now()
      dy = 0
      active = false
      decided = el.scrollTop > 0 // scheda già scorsa: si scorre e basta
    }
    const move = (e: TouchEvent) => {
      const y = e.touches[0].clientY - startY
      if (!decided) {
        const x = Math.abs(e.touches[0].clientX - startX)
        if (Math.abs(y) < 6 && x < 6) return
        decided = true
        active = y > 0 && y > x // verso il basso, non in orizzontale (foto)
      }
      if (!active) return
      e.preventDefault()
      dy = Math.max(0, y)
      set(dy, false)
    }
    const end = () => {
      if (!active) return
      active = false
      const fast = dy > 60 && dy / Math.max(1, Date.now() - startAt) > 0.6
      if (dy > 120 || fast) {
        set(window.innerHeight, true)
        setTimeout(closeProduct, 200)
      } else set(0, true)
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
      set(0, false)
    }
  }, [panel, drag, open])
}

function SheetContent({ product }: { product: Product }) {
  const fresh = freshPrice(product)
  const { wishlist, actions, allProducts } = useApp()
  const similar = useMemo(() => similarProducts(product, allProducts), [product, allProducts])
  const details = useDetails(product.id)
  const photos = galleryOf(product, details)
  const saved = wishlist.some((w) => w.product.id === product.id)
  const [index, setIndex] = useState(0)
  const strip = useRef<HTMLDivElement>(null)

  return (
    <>
      <button
        type="button"
        onClick={closeProduct}
        aria-label="Chiudi"
        className="absolute top-3 right-3 z-20 grid size-9 place-items-center rounded-full bg-neutral-100 text-neutral-700"
      >
        <X className="size-5" />
      </button>

      <div className="relative">
        <div
          ref={strip}
          className="flex aspect-square snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
          onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        >
          {(photos.length ? photos : [undefined]).map((src, i) => (
            <ProductImage key={src ?? i} product={product} src={src} eager={i < 2} className="size-full shrink-0 snap-center" />
          ))}
        </div>
        <DiscountBadge product={product} />
        <NewBadge product={product} />
        {photos.length > 1 && (
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {photos.map((src, i) => (
              <button
                key={src}
                type="button"
                aria-label={`Foto ${i + 1}`}
                onClick={() => strip.current?.scrollTo({ left: i * strip.current.clientWidth, behavior: 'smooth' })}
                className={`size-2 rounded-full ${i === index ? 'bg-neutral-900' : 'bg-neutral-300'}`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4 px-5 pt-4">
        <div className="space-y-1.5">
          <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
            {brandAndStore(product, categoryLabel(product.category))}
          </p>
          <h2 className="text-lg leading-snug font-semibold">{product.title}</h2>
          <PriceTag product={product} size="lg" />
        </div>

        {/* Solo l'elenco completo letto da Amazon (sizesAt): quelle viste nei titoli sono solo alcune varianti. */}
        {hasSizes(product.category) && (
          <p className="text-sm text-neutral-600">
            {product.sizesAt && product.sizes && product.sizes.length > 0 && (
              <>
                <span className="font-semibold text-neutral-800">Taglie disponibili:</span> {product.sizes.join(' · ')}
                <br />
              </>
            )}
            <span className="text-xs text-neutral-500">
              Taglie diverse possono avere prezzi diversi: controlla il prezzo della tua su Amazon.
            </span>
          </p>
        )}

        {/* Sempre a portata di dito: resta fisso in basso mentre si scorre la scheda. */}
        <div className="sticky bottom-0 z-10 -mx-5 flex gap-2 bg-white px-5 py-2 shadow-[0_-8px_16px_-12px_rgba(0,0,0,0.25)]">
          <StoreLink
            product={product}
            className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-neutral-900 font-semibold text-white"
          >
            <span className="truncate">
              {storeLinkLabel(product)}
              {fresh && ` · ${fresh.from ? 'da ' : ''}${formatPrice(fresh.price)}`}
            </span>
          </StoreLink>
          <button
            type="button"
            onClick={() => (saved ? actions.remove(product) : actions.like(product))}
            aria-label={saved ? 'Togli dai preferiti' : 'Salva nei preferiti'}
            className={`grid size-12 place-items-center rounded-full ring-1 transition active:scale-90 ${
              saved ? 'bg-rose-500 text-[#fff] ring-rose-500' : 'bg-white text-rose-500 ring-neutral-200'
            }`}
          >
            {saved ? <Check className="size-5" strokeWidth={3} /> : <Heart className="size-5" />}
          </button>
          <ShareButton
            product={product}
            className="grid size-12 place-items-center rounded-full bg-white text-neutral-700 ring-1 ring-neutral-200"
          />
        </div>
        <SendToFriends
          kind="consiglio"
          productId={product.id}
          label="Consiglia a un amico"
          className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold ring-1 ring-neutral-200 active:scale-[0.98]"
        />

        <CompleteLook product={product} />

        {details?.features && details.features.length > 0 && (
          <div>
            <h3 className="mb-2 font-semibold">Caratteristiche</h3>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-neutral-700">
              {details.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}
        {similar.length > 0 && (
          <div>
            <h3 className="mb-2 font-semibold">Simili</h3>
            <ul className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
              {similar.map((p) => (
                <li key={p.id} className="w-32 shrink-0 snap-start">
                  <button type="button" onClick={() => openProduct(p)} className="block w-full text-left active:scale-[0.97]">
                    <span className="relative block aspect-square overflow-hidden rounded-2xl ring-1 ring-black/5">
                      <ProductImage product={p} className="size-full" />
                      <DiscountBadge product={p} size="sm" />
                    </span>
                    <span className="mt-1.5 block truncate text-[11px] font-medium tracking-wide text-neutral-500 uppercase">{p.brand}</span>
                    <span className="line-clamp-2 text-xs leading-snug">{p.title}</span>
                    <PriceTag product={p} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <ReportProduct product={product} />
        <p className="text-xs text-neutral-400">
          Prezzo e disponibilità possono cambiare: quelli validi sono sul sito di {storeName(product.store)} al momento
          dell'acquisto.
        </p>
      </div>
    </>
  )
}
