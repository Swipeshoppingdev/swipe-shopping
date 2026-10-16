import { m as motion, useMotionValue, usePresence, usePresenceData, useTransform } from 'framer-motion'
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { categoryLabel } from '../config/categories'
import { brandAndStore } from '../config/stores'
import type { Product } from '../types/product'
import { galleryOf } from '../lib/gallery'
import { openProduct } from '../lib/productSheet'
import { useDetails } from '../lib/useDetails'
import { DiscountBadge } from './DiscountBadge'
import { NewBadge } from './NewBadge'
import { SizeBadge } from './SizeBadge'
import { PriceTag } from './PriceTag'
import { PriceRankPill } from './PriceCheck'
import { ProductImage } from './ProductImage'
import { StoreLink } from './StoreLink'

const SWIPE_DISTANCE = 110
const SWIPE_VELOCITY = 600

export type SwipeDir = 1 | -1

const EXIT_MS = 320

export function SwipeCard({
  product,
  index,
  onSwipe,
}: {
  product: Product
  /** 0 = card in cima */
  index: number
  onSwipe: (dir: SwipeDir) => void
}) {
  // Una carta che sta uscendo resta ancora a schermo per l'animazione: non deve più ricevere tocchi.
  // (Toccarla fermava l'uscita: la carta restava bloccata sopra il mazzo e ogni swipe salvava quelle sotto.)
  const [present, safeToRemove] = usePresence()
  const exitDir = usePresenceData() as SwipeDir | undefined
  const card = useRef<HTMLElement>(null)
  const isTop = index === 0 && present
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-300, 0, 300], [-16, 0, 16])
  const likeOpacity = useTransform(x, [20, SWIPE_DISTANCE], [0, 1])
  const nopeOpacity = useTransform(x, [-SWIPE_DISTANCE, -20], [1, 0])
  const dragged = useRef(false)
  const details = useDetails(product.id, isTop)
  const photos = galleryOf(product, details)
  const [photo, setPhoto] = useState(0)

  // Uscita animata dal browser (Web Animations), non da JavaScript a ogni fotogramma: la carta vola via fluida
  // anche se nello stesso momento il telefono è occupato a preparare la carta successiva.
  useEffect(() => {
    if (present) return
    const el = card.current
    if (!el?.animate) {
      safeToRemove?.()
      return
    }
    const dir = exitDir ?? 1
    const from = `translateX(${x.get()}px) rotate(${rotate.get()}deg)`
    x.stop()
    const anim = el.animate(
      [
        { transform: from, opacity: 1 },
        {
          transform: `translateX(${dir * (window.innerWidth + 200)}px) rotate(${dir * 22}deg)`,
          opacity: 0,
        },
      ],
      { duration: EXIT_MS, easing: 'ease-out', fill: 'forwards' },
    )
    anim.onfinish = () => safeToRemove?.()
    return () => anim.cancel()
  }, [present]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tocco sulla foto: ai lati cambia foto (come le storie), al centro apre la scheda.
  const onImageClick = (e: MouseEvent<HTMLDivElement>) => {
    if (dragged.current || !isTop) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pos = (e.clientX - rect.left) / rect.width
    if (photos.length > 1 && pos < 0.33) setPhoto((i) => Math.max(0, i - 1))
    else if (photos.length > 1 && pos > 0.67) setPhoto((i) => Math.min(photos.length - 1, i + 1))
    else openProduct(product)
  }

  // Trascinamento fatto a mano (non con il drag di framer-motion): quello misurava la pagina a ogni carta e a ogni
  // tocco, e sui telefoni lenti faceva perdere fotogrammi. Qui si sposta solo la carta.
  const pan = useRef<{
    id: number
    x0: number
    y0: number
    base: number
    active: boolean
    samples: [number, number][]
  } | null>(null)
  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (!isTop || (e.pointerType === 'mouse' && e.button !== 0)) return
    pan.current = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      base: x.get(),
      active: false,
      samples: [[e.timeStamp, e.clientX]],
    }
  }
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const s = pan.current
    if (!s || s.id !== e.pointerId) return
    // La carta è già partita: niente x.stop(), altrimenti resterebbe ferma sopra le altre.
    if (!present) {
      pan.current = null
      return
    }
    const dx = e.clientX - s.x0
    if (!s.active) {
      if (Math.abs(dx) < 6 && Math.abs(e.clientY - s.y0) < 6) return
      // Movimento verticale: è uno scroll, la carta resta ferma.
      if (Math.abs(e.clientY - s.y0) > Math.abs(dx)) {
        pan.current = null
        return
      }
      s.active = true
      dragged.current = true
      x.stop()
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    s.samples.push([e.timeStamp, e.clientX])
    if (s.samples.length > 6) s.samples.shift()
    // Come prima (dragElastic 0.9): la carta segue il dito quasi del tutto.
    x.set(s.base + dx * 0.9)
  }
  const onPointerEnd = (e: PointerEvent<HTMLElement>) => {
    const s = pan.current
    if (!s || s.id !== e.pointerId) return
    pan.current = null
    if (!s.active || !present) return
    const offset = e.clientX - s.x0
    const [t0, x0] = s.samples[0]
    const [t1, x1] = s.samples[s.samples.length - 1]
    const velocity = t1 > t0 ? ((x1 - x0) / (t1 - t0)) * 1000 : 0
    if (e.type === 'pointerup' && (offset > SWIPE_DISTANCE || velocity > SWIPE_VELOCITY)) onSwipe(1)
    else if (e.type === 'pointerup' && (offset < -SWIPE_DISTANCE || velocity < -SWIPE_VELOCITY)) onSwipe(-1)
    // Molla di ritorno dal motore delle animazioni scaricato a parte (già arrivato quando si trascina una carta).
    else void import('../lib/motionFeatures').then((m) => m.animate(x, 0, { type: 'spring', stiffness: 420, damping: 32 }))
    // Il click che segue un trascinamento non deve aprire il link.
    setTimeout(() => (dragged.current = false), 0)
  }

  return (
    // Posto nel mazzo (dietro: più piccola e più in basso) con una transizione CSS, che il browser anima da solo
    // senza JavaScript: quando la carta sotto sale in cima non scatta anche se il telefono è occupato.
    <div
      className="swipe-slot absolute inset-0"
      style={{
        transform: index ? `translateY(${index * 14}px) scale(${1 - index * 0.04})` : undefined,
        opacity: index > 1 ? 0 : 1,
        zIndex: 10 - index,
        pointerEvents: present ? undefined : 'none',
        willChange: index < 2 ? 'transform' : undefined,
      }}
    >
      <motion.article
        ref={card}
        // Foto non trascinabili dal browser (rovinerebbero lo swipe col mouse); i tocchi vanno al riquadro della foto.
        className="absolute inset-0 flex flex-col overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-black/5 select-none [&_img]:pointer-events-none"
        // will-change: le prime due carte su un livello a parte, così trascinarle non ridisegna foto e ombra a ogni fotogramma.
        style={{
          x,
          rotate,
          touchAction: isTop ? 'pan-y' : undefined,
          willChange: index < 2 ? 'transform' : undefined,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        aria-hidden={!isTop}
        aria-label={isTop ? product.title : undefined}
      >
        <div className="relative min-h-0 flex-1">
          <div
            className="size-full cursor-pointer"
            onClick={onImageClick}
            role={isTop ? 'button' : undefined}
            aria-label={isTop ? `Dettagli di ${product.title}` : undefined}
          >
            <ProductImage
              key={photos[photo] ?? 'main'}
              product={product}
              src={isTop ? photos[photo] : undefined}
              eager={index < 3}
              priority={isTop}
              className="size-full"
            />
          </div>
          {isTop && photos.length > 1 && (
            <div className="pointer-events-none absolute inset-x-4 top-2.5 flex gap-1">
              {photos.map((src, i) => (
                <span
                  key={src}
                  className={`h-1 flex-1 rounded-full ${i === photo ? 'bg-neutral-800' : 'bg-neutral-300/80'}`}
                />
              ))}
            </div>
          )}
          {isTop && (
            <>
              <motion.span
                style={{ opacity: likeOpacity }}
                className="pointer-events-none absolute top-6 left-5 -rotate-12 rounded-xl border-4 border-rose-500 bg-rose-500 px-3 py-1 text-2xl font-black tracking-wide text-[#fff] shadow-lg"
              >
                MI PIACE
              </motion.span>
              <motion.span
                style={{ opacity: nopeOpacity }}
                className="pointer-events-none absolute top-6 right-5 rotate-12 rounded-xl border-4 border-[#262626] bg-[#fff]/90 px-3 py-1 text-2xl font-black tracking-wide text-[#262626]"
              >
                NO
              </motion.span>
            </>
          )}
          {/* In basso a sinistra: lo sconto e, accanto, quanto è conveniente il prezzo (spiegato nella scheda). */}
          <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2">
            <DiscountBadge product={product} inline />
            {isTop && <PriceRankPill product={product} />}
          </div>
          <NewBadge product={product} />
          <SizeBadge product={product} />
          {product.searchQuery && (
            <span className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-neutral-900/80 px-3 py-1 text-xs font-medium text-white">
              Esplora la categoria
            </span>
          )}
        </div>
        <div
          className="cursor-pointer space-y-1.5 border-t border-neutral-100 px-5 pt-3 pb-4"
          onClick={(e) => {
            // Il link "Apri" porta al negozio, il resto apre la scheda.
            if (isTop && !dragged.current && !(e.target as HTMLElement).closest('a')) openProduct(product)
          }}
        >
          <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
            {brandAndStore(product, categoryLabel(product.category))}
          </p>
          <h2 className="line-clamp-2 text-lg leading-snug font-semibold text-neutral-900">{product.title}</h2>
          <div className="flex items-center justify-between gap-3">
            <PriceTag product={product} size="lg" />
            {isTop && (
              <StoreLink
                product={product}
                className="inline-flex items-center gap-1 text-sm font-medium text-neutral-700 underline-offset-4 hover:underline"
                onClickCapture={(e) => dragged.current && e.preventDefault()}
              >
                Apri
              </StoreLink>
            )}
          </div>
        </div>
      </motion.article>
    </div>
  )
}
