import { AnimatePresence, motion } from 'framer-motion'
import { Heart, Play, RefreshCw, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ProductImage } from '../components/ProductImage'
import { ADMIN_EMAIL } from '../config/app'
import { universeOf } from '../config/categories'
import { STYLE_LABEL, buildOutfits, outfitTotal, type Outfit } from '../lib/outfits'
import { formatPrice, freshPrice } from '../lib/price'
import { routeHref } from '../lib/useHashRoute'
import { useApp } from '../state/AppState'
import { useAuth } from '../state/AuthState'
import type { Product } from '../types/product'

/**
 * Studio (#/studio), solo per il titolare: video verticali per Instagram e TikTok, da registrare con la
 * registrazione schermo dell'iPhone. I contenuti cambiano ogni giorno; "Altri" ne propone di nuovi.
 * Le foto dei prodotti si mostrano come nell'app (mai modificate o unite).
 */
type Format = 'offerte' | 'sfida' | 'outfit' | 'swipe'
const FORMATS: { id: Format; label: string }[] = [
  { id: 'offerte', label: 'Top 5 offerte' },
  { id: 'sfida', label: 'Questo o quello' },
  { id: 'outfit', label: 'Outfit sotto 100 €' },
  { id: 'swipe', label: 'Swipe in diretta' },
]
const OUTFIT_BUDGET = 100

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const today = () => Math.floor(Date.now() / 86_400_000)
function pick<T>(list: T[], n: number, rand: () => number) {
  const copy = [...list]
  const out: T[] = []
  while (copy.length && out.length < n) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0])
  return out
}

/** Un fotogramma del video: cosa mostrare e per quanti millisecondi */
interface Slide {
  ms: number
  node: ReactNode
}

export function StudioPage() {
  const auth = useAuth()
  if (!auth.ready) return null
  if (auth.user?.email?.toLowerCase() !== ADMIN_EMAIL) {
    return <p className="py-16 text-center text-sm text-[#737373]">Questa pagina è riservata.</p>
  }
  return <Studio />
}

function Studio() {
  const { allProducts } = useApp()
  const [format, setFormat] = useState<Format>('offerte')
  const [gender, setGender] = useState<'donna' | 'uomo'>('donna')
  const [variant, setVariant] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [step, setStep] = useState(0)

  const moda = useMemo(() => allProducts.filter((p) => universeOf(p.category) === 'moda'), [allProducts])
  const outfits = useMemo(() => buildOutfits(moda, gender), [moda, gender])

  const slides = useMemo<Slide[]>(() => {
    const rand = rng(today() * 1000 + variant * 7 + (gender === 'uomo' ? 1 : 0) + format.length)
    if (format === 'offerte') {
      const deals = allProducts
        .filter((p) => p.availability !== 'out_of_stock' && p.imageUrl && (freshPrice(p)?.discountPct ?? 0) >= 20)
        .sort((a, b) => freshPrice(b)!.discountPct! - freshPrice(a)!.discountPct!)
        .slice(0, 80)
      // Cinque offerte di categorie diverse, dalla più piccola alla più grande: la migliore per ultima.
      const chosen: Product[] = []
      for (const p of pick(deals, deals.length, rand)) {
        if (chosen.length < 5 && !chosen.some((c) => c.category === p.category)) chosen.push(p)
      }
      chosen.sort((a, b) => freshPrice(a)!.discountPct! - freshPrice(b)!.discountPct!)
      return [
        { ms: 2200, node: <Title kicker="Le migliori di oggi" title="TOP 5 OFFERTE" sub="Prezzi verificati oggi" /> },
        ...chosen.map((p, i) => ({ ms: 3200, node: <DealSlide product={p} rank={chosen.length - i} /> })),
        { ms: 3000, node: <Outro line="Tutte le offerte su" /> },
      ]
    }
    if (format === 'outfit') {
      const cheap = outfits.filter((o) => {
        const t = outfitTotal(o.items)
        return t !== null && t <= OUTFIT_BUDGET && o.items.length >= 4
      })
      const o = pick(cheap.length ? cheap : outfits, 1, rand)[0]
      if (!o) return []
      return [
        { ms: 2000, node: <Title kicker={`Outfit ${STYLE_LABEL[o.style].toLowerCase()}`} title={`SOTTO ${OUTFIT_BUDGET} €`} sub={`Look completo da ${o.gender}`} /> },
        ...o.items.map((_, i) => ({ ms: 1300, node: <OutfitBuild outfit={o} shown={i + 1} /> })),
        { ms: 3200, node: <OutfitBuild outfit={o} shown={o.items.length} total /> },
        { ms: 3000, node: <Outro line="Altri outfit su" /> },
      ]
    }
    if (format === 'sfida') {
      const ok = outfits.filter((o) => outfitTotal(o.items) !== null && o.items.length >= 3 && o.items.length <= 4)
      const [a] = pick(ok, 1, rand)
      const b = a && pick(ok.filter((o) => o.style === a.style && o.id !== a.id), 1, rand)[0]
      if (!a || !b) return []
      return [
        { ms: 1800, node: <Title kicker={`Outfit ${STYLE_LABEL[a.style].toLowerCase()}`} title="QUESTO O QUELLO?" sub="Scegli prima di scorrere" /> },
        { ms: 7000, node: <Versus a={a} b={b} /> },
        { ms: 3000, node: <Outro line="Scrivi A o B nei commenti 👇" /> },
      ]
    }
    // Swipe in diretta: carte che vanno da sole a destra o a sinistra, come se qualcuno usasse l'app.
    const cards = pick(
      moda.filter((p) => p.availability !== 'out_of_stock' && p.imageUrl && freshPrice(p)),
      8,
      rand,
    )
    return [
      ...cards.map((p) => ({ ms: 1700, node: <AutoSwipe product={p} yes={rand() > 0.4} /> })),
      { ms: 3000, node: <Outro line="Prova anche tu su" /> },
    ]
  }, [format, gender, variant, allProducts, moda, outfits])

  // Riproduzione: un fotogramma dopo l'altro, poi si ferma sull'ultimo.
  useEffect(() => {
    if (!playing || step >= slides.length - 1) return
    const t = setTimeout(() => setStep((s) => s + 1), slides[step].ms)
    return () => clearTimeout(t)
  }, [playing, step, slides])

  const start = () => {
    setStep(0)
    setPlaying(true)
  }
  const stop = () => {
    setPlaying(false)
    setStep(0)
  }
  const current = slides[playing ? step : format === 'swipe' ? 0 : Math.min(1, slides.length - 1)]

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#000]">
      {/* Il palco: 9:16, grande quanto lo schermo del telefono */}
      <div
        className="relative h-full max-h-[calc(100vw*16/9)] w-full max-w-[calc(100dvh*9/16)] overflow-hidden bg-gradient-to-b from-[#1a0b14] via-[#14080f] to-[#000] text-[#fff]"
        onClick={() => playing && stop()}
      >
        <div className="pointer-events-none absolute -top-32 -left-24 size-96 rounded-full bg-[#f43f5e]/25 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 -bottom-32 size-96 rounded-full bg-[#6366f1]/25 blur-3xl" />
        <AnimatePresence mode="wait">
          <motion.div
            key={`${format}-${variant}-${playing ? step : 'preview'}`}
            className="absolute inset-0 flex flex-col"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.35 }}
          >
            {current ? current.node : <Title kicker="Studio" title="POCHI DATI" sub="Il catalogo sta ancora caricando" />}
          </motion.div>
        </AnimatePresence>
        {playing && step < slides.length - 1 && (
          <div className="absolute inset-x-6 top-[max(1rem,env(safe-area-inset-top))] flex gap-1">
            {slides.map((_, i) => (
              <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-[#fff]/90' : 'bg-[#fff]/25'}`} />
            ))}
          </div>
        )}
      </div>

      {!playing && (
        <div className="absolute inset-x-0 bottom-0 space-y-3 rounded-t-3xl border-t border-[#fff]/15 bg-[#0b0b0d] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(0,0,0,0.8)]">
          <div className="flex flex-wrap justify-center gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFormat(f.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${format === f.id ? 'bg-[#fff] text-[#111]' : 'bg-[#2a2a30] text-[#fff] ring-1 ring-[#fff]/20'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2">
            {format !== 'offerte' && format !== 'swipe' && (
              <div className="flex rounded-full bg-[#2a2a30] p-1 text-sm font-semibold ring-1 ring-[#fff]/20">
                {(['donna', 'uomo'] as const).map((g) => (
                  <button key={g} type="button" onClick={() => setGender(g)} className={`rounded-full px-3 py-1 capitalize ${gender === g ? 'bg-[#fff] text-[#111]' : 'text-[#fff]'}`}>
                    {g}
                  </button>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setVariant((v) => v + 1)} className="inline-flex items-center gap-1.5 rounded-full bg-[#2a2a30] px-4 py-2 text-sm font-semibold text-[#fff] ring-1 ring-[#fff]/20">
              <RefreshCw className="size-4" /> Altri
            </button>
            <button type="button" onClick={start} disabled={!slides.length} className="inline-flex items-center gap-1.5 rounded-full bg-[#f43f5e] px-5 py-2 text-sm font-bold text-[#fff] disabled:opacity-40">
              <Play className="size-4 fill-current" /> Avvia
            </button>
            <a href={routeHref('profilo')} aria-label="Chiudi Studio" className="grid size-9 place-items-center rounded-full bg-[#2a2a30] text-[#fff] ring-1 ring-[#fff]/20">
              <X className="size-5" />
            </a>
          </div>
          <p className="text-center text-xs text-[#fff]/75">
            Avvia la registrazione schermo, poi tocca Avvia. Tocca il video per fermarlo. Contenuti nuovi ogni giorno.
          </p>
        </div>
      )}
    </div>
  )
}

function Title({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
      <p className="text-sm font-bold tracking-[0.3em] text-[#fb7185] uppercase">{kicker}</p>
      <h1 className="text-5xl leading-none font-black tracking-tight">{title}</h1>
      {sub && <p className="text-base text-[#fff]/70">{sub}</p>}
      <Logo className="mt-6 opacity-80" />
    </div>
  )
}

function Logo({ className = '' }: { className?: string }) {
  return (
    <p className={`text-2xl font-black tracking-tight ${className}`}>
      Swipe<span className="text-[#f43f5e]">Shopping</span>
    </p>
  )
}

function Outro({ line }: { line: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <img src="icons/icon-512.png" alt="" className="size-24 rounded-3xl shadow-2xl shadow-[#f43f5e]/30" />
      <p className="text-lg text-[#fff]/80">{line}</p>
      <Logo className="text-4xl" />
      <p className="rounded-full bg-[#fff] px-5 py-2 text-lg font-bold text-[#111]">swipeshopping.app</p>
      <p className="text-sm text-[#fff]/60">Link in bio · gratis, senza registrazione</p>
    </div>
  )
}

function Price({ product, big }: { product: Product; big?: boolean }) {
  const fp = freshPrice(product)
  if (!fp) return null
  return (
    <div className="flex items-baseline gap-3">
      <span className={`${big ? 'text-4xl' : 'text-xl'} font-black`}>
        {fp.from ? 'da ' : ''}
        {formatPrice(fp.price)}
      </span>
      {fp.originalPrice && <span className={`${big ? 'text-xl' : 'text-sm'} text-[#fff]/50 line-through`}>{formatPrice(fp.originalPrice)}</span>}
    </div>
  )
}

function DealSlide({ product, rank }: { product: Product; rank: number }) {
  const pct = freshPrice(product)?.discountPct
  return (
    <div className="flex flex-1 flex-col justify-center gap-5 px-7">
      <p className="text-6xl font-black text-[#fff]/15">#{rank}</p>
      <div className="relative">
        <ProductImage product={product} eager className="aspect-square w-full overflow-hidden rounded-3xl" />
        {pct && (
          <motion.span
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: -8 }}
            transition={{ delay: 0.4, type: 'spring', stiffness: 260, damping: 14 }}
            className="absolute -top-4 -right-3 rounded-2xl bg-[#f43f5e] px-4 py-2 text-3xl font-black shadow-xl"
          >
            -{pct}%
          </motion.span>
        )}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-bold tracking-widest text-[#fb7185] uppercase">{product.brand}</p>
        <p className="line-clamp-2 text-xl font-semibold">{product.title}</p>
        <Price product={product} big />
      </div>
    </div>
  )
}

function OutfitGrid({ outfit, shown = outfit.items.length }: { outfit: Outfit; shown?: number }) {
  const cols = outfit.items.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'
  return (
    <div className={`grid ${cols} gap-2`}>
      {outfit.items.map((p, i) => (
        <motion.div
          key={p.id}
          initial={false}
          animate={{ opacity: i < shown ? 1 : 0, scale: i < shown ? 1 : 0.85 }}
          transition={{ type: 'spring', stiffness: 220, damping: 20 }}
          className="relative"
        >
          <ProductImage product={p} eager className="aspect-square w-full overflow-hidden rounded-2xl" />
          {i < shown && freshPrice(p) && (
            <span className="absolute bottom-1.5 left-1.5 rounded-full bg-[#000]/80 px-2 py-0.5 text-xs font-bold">{formatPrice(freshPrice(p)!.price)}</span>
          )}
        </motion.div>
      ))}
    </div>
  )
}

function OutfitBuild({ outfit, shown, total }: { outfit: Outfit; shown: number; total?: boolean }) {
  const sum = outfitTotal(outfit.items)
  const last = outfit.items[shown - 1]
  return (
    <div className="flex flex-1 flex-col justify-center gap-5 px-6">
      <OutfitGrid outfit={outfit} shown={shown} />
      {total ? (
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
          <p className="text-sm font-bold tracking-[0.3em] text-[#fb7185] uppercase">Totale look</p>
          <p className="text-6xl font-black">{sum !== null ? formatPrice(sum) : ''}</p>
        </motion.div>
      ) : (
        last && (
          <div className="min-h-24 text-center">
            <p className="text-sm font-bold tracking-widest text-[#fb7185] uppercase">{last.brand}</p>
            <p className="line-clamp-2 text-lg font-semibold">{last.title}</p>
          </div>
        )
      )}
    </div>
  )
}

function Versus({ a, b }: { a: Outfit; b: Outfit }) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-3 px-4">
      {[a, b].map((o, i) => (
        <motion.div
          key={o.id}
          initial={{ x: i ? 80 : -80, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: i * 0.5, type: 'spring', stiffness: 160, damping: 18 }}
          className="relative rounded-3xl bg-[#fff]/5 p-2 ring-1 ring-[#fff]/10"
        >
          <span className={`absolute -top-3 z-10 grid size-12 place-items-center rounded-full text-2xl font-black shadow-xl ${i ? 'right-3 bg-[#6366f1]' : 'left-3 bg-[#f43f5e]'}`}>
            {i ? 'B' : 'A'}
          </span>
          <div className="grid grid-cols-4 gap-1.5">
            {o.items.slice(0, 4).map((p) => (
              <ProductImage key={p.id} product={p} eager className="aspect-square w-full overflow-hidden rounded-xl" />
            ))}
          </div>
          {outfitTotal(o.items) !== null && <p className="mt-1.5 text-center text-sm font-bold">Totale {formatPrice(outfitTotal(o.items)!)}</p>}
        </motion.div>
      ))}
      <p className="text-center text-2xl font-black">Quale scegli? 🤔</p>
    </div>
  )
}

function AutoSwipe({ product, yes }: { product: Product; yes: boolean }) {
  const dir = yes ? 1 : -1
  return (
    <div className="flex flex-1 flex-col justify-center px-6">
      <motion.div
        initial={{ x: 0, rotate: 0, opacity: 1 }}
        animate={{ x: [0, 0, dir * 40, dir * 520], rotate: [0, 0, dir * 4, dir * 24], opacity: [1, 1, 1, 0] }}
        transition={{ duration: 1.6, times: [0, 0.45, 0.7, 1], ease: 'easeIn' }}
        className="relative overflow-hidden rounded-3xl bg-[#fff] text-[#111] shadow-2xl"
      >
        <ProductImage product={product} eager className="aspect-[4/5] w-full" />
        <div className="space-y-0.5 p-4">
          <p className="text-[11px] font-semibold tracking-wide text-[#737373] uppercase">{product.brand}</p>
          <p className="line-clamp-1 font-semibold">{product.title}</p>
          {freshPrice(product) && <p className="text-lg font-black">{formatPrice(freshPrice(product)!.price)}</p>}
        </div>
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0, 1] }}
          transition={{ duration: 1.1, times: [0, 0.6, 1] }}
          className={`absolute top-6 rounded-xl border-4 px-3 py-1 text-3xl font-black ${
            yes ? 'left-6 -rotate-12 border-[#10b981] text-[#10b981]' : 'right-6 rotate-12 border-[#f43f5e] text-[#f43f5e]'
          }`}
        >
          {yes ? 'SÌ' : 'NO'}
        </motion.span>
      </motion.div>
      <div className="mt-6 flex justify-center gap-6">
        <span className={`grid size-16 place-items-center rounded-full bg-[#fff]/10 text-3xl font-black ${!yes ? 'ring-4 ring-[#f43f5e]' : ''}`}>
          <X className="size-8" />
        </span>
        <span className={`grid size-16 place-items-center rounded-full bg-[#f43f5e] ${yes ? 'ring-4 ring-[#fff]' : ''}`}>
          <Heart className="size-8 fill-current" />
        </span>
      </div>
    </div>
  )
}
