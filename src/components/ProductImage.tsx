import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { categoryGroupOf } from '../config/categories'
import { productImageUrl } from '../config/stores'
import { noteImageTime, sizedImage, slowNetwork } from '../lib/images'
import type { Product } from '../types/product'

/** Tentativi in più quando la rete perde la foto (rete lenta o che va e viene), con le attese prima di ciascuno. */
const RETRY_MS = [1000, 3000]

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
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const img = useRef<HTMLImageElement>(null)
  const started = useRef(0)
  // Foto più leggera con rete lenta (vedi src/lib/images.ts), decisa all'apertura: non cambia indirizzo a metà download.
  const [slow] = useState(slowNetwork)
  const src = sizedImage(srcOverride ?? productImageUrl(product), slow)
  // Foto diversa nello stesso posto: si riparte da capo.
  const [shownSrc, setShownSrc] = useState(src)
  if (shownSrc !== src) {
    setShownSrc(src)
    setFailed(false)
    setAttempt(0)
    setLoaded(false)
  }
  const group = categoryGroupOf(product.category)

  // Già in memoria (scaricata in anticipo): si mostra subito, senza dissolvenza.
  useLayoutEffect(() => {
    const el = img.current
    started.current = performance.now()
    if (el?.complete && el.naturalWidth > 10) setLoaded(true)
  }, [attempt, src])

  useEffect(() => {
    if (!failed) return
    // Tornata la rete: si riprova.
    const retry = () => {
      setFailed(false)
      setAttempt((a) => a + 1)
    }
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [failed])

  if (!src || failed) {
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br from-rose-50 via-white to-amber-50 ${className ?? ''}`}>
        <span className="text-7xl drop-shadow-sm select-none" aria-hidden>
          {group?.emoji ?? '🛍️'}
        </span>
      </div>
    )
  }
  return (
    <div className={`relative bg-[#fff] ${className ?? ''}`}>
      {!loaded && (
        // Mentre la foto arriva: niente riquadro bianco vuoto, ma l'icona della categoria che pulsa piano.
        <div className="img-wait absolute inset-0 flex items-center justify-center select-none" aria-hidden>
          <span className="text-6xl opacity-25 grayscale">{group?.emoji ?? '🛍️'}</span>
        </div>
      )}
      <img
        // Un elemento nuovo a ogni tentativo: il browser riscarica la foto (quelle fallite non restano in cache).
        key={attempt}
        ref={img}
        src={src}
        alt={product.title}
        loading={eager || priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        draggable={false}
        onError={() => {
          if (attempt < RETRY_MS.length) setTimeout(() => setAttempt((a) => a + 1), RETRY_MS[attempt])
          else setFailed(true)
        }}
        onLoad={(e) => {
          // Il widget Amazon restituisce un GIF 1x1 quando non ha l'immagine.
          if (e.currentTarget.naturalWidth < 10) return setFailed(true)
          if (!loaded) {
            noteImageTime(performance.now() - started.current)
            setLoaded(true)
          }
        }}
        className={`relative size-full object-contain p-4 select-none transition-opacity duration-200 ${loaded ? '' : 'img-in'}`}
      />
    </div>
  )
}
