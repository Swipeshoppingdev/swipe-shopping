import { AnimatePresence, m as motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion'
import { Heart, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PriceTag } from '../components/PriceTag'
import { ProductImage } from '../components/ProductImage'
import { Avatar, LoginNeeded, useProductsById } from '../components/SocialBits'
import { StoreLink } from '../components/StoreLink'
import { brandAndStore } from '../config/stores'
import { openProduct } from '../lib/productSheet'
import { hashParam, social, type SwipeSession } from '../lib/social'
import { routeHref } from '../lib/useHashRoute'
import { useAuth } from '../state/AuthState'
import type { Product } from '../types/product'

/** Swipe insieme (#/insieme/<id>): lo stesso mazzo per due amici, alla fine i prodotti piaciuti a entrambi. */
export function SwipeTogetherPage() {
  const auth = useAuth()
  const [id] = useState(() => hashParam('insieme'))
  const [session, setSession] = useState<SwipeSession | null | undefined>(id ? undefined : null)
  const [error, setError] = useState('')
  const [exitDir, setExitDir] = useState<1 | -1>(1)
  const { products, loading } = useProductsById(session?.product_ids)
  const userId = auth.user?.id

  const reload = useCallback(async () => {
    if (!id) return
    try {
      setSession(await social.swipe(id))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [id])
  useEffect(() => {
    if (userId) void Promise.resolve().then(reload)
  }, [reload, userId])

  // Prodotti non più in catalogo: contano come "no", così il mazzo si può finire.
  const missing = !loading && session ? session.product_ids.filter((pid) => !products.some((p) => p.id === pid) && !(pid in session.my_votes)) : []
  useEffect(() => {
    if (!session || missing.length === 0) return
    void Promise.all(missing.map((pid) => social.swipeVote(session.id, pid, false))).then(reload)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo quando cambia l'elenco dei mancanti
  }, [missing.join(',')])

  if (!auth.ready) return <p className="py-10 text-center text-neutral-500">Caricamento…</p>
  if (!auth.user) return <LoginNeeded text="Accedi per fare Swipe insieme con i tuoi amici." />
  if (error) return <p className="py-10 text-center text-neutral-500">{error}</p>
  if (session === undefined) return <p className="py-10 text-center text-neutral-500">Caricamento…</p>
  if (!session) return <p className="py-10 text-center text-neutral-500">Questo Swipe insieme non esiste più.</p>

  const todo = products.filter((p) => !(p.id in session.my_votes))
  const current = todo[0]
  const done = session.product_ids.length - session.product_ids.filter((pid) => !(pid in session.my_votes)).length
  const vote = async (yes: boolean) => {
    if (!current) return
    setExitDir(yes ? 1 : -1)
    setSession({ ...session, my_votes: { ...session.my_votes, [current.id]: yes } })
    try {
      await social.swipeVote(session.id, current.id, yes)
      if (todo.length === 1) await reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const matches = session.matches ? products.filter((p) => session.matches!.includes(p.id)) : null

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center gap-3 pt-2">
        <Avatar emoji={session.other.avatar} />
        <div>
          <p className="text-xs font-semibold tracking-wide text-rose-500 uppercase">Swipe insieme</p>
          <h1 className="text-lg leading-tight font-bold">con {session.other.handle}</h1>
          <p className="text-sm text-neutral-500">
            {done} di {session.product_ids.length} · {session.other_done ? 'ha finito' : 'non ha ancora finito'}
          </p>
        </div>
      </div>

      {current ? (
        <div className="space-y-3">
          <div className="relative h-[calc(38dvh+8.5rem)]">
            <AnimatePresence custom={exitDir} initial={false}>
              <TogetherCard key={current.id} product={current} onSwipe={(dir) => void vote(dir === 1)} />
            </AnimatePresence>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => vote(false)}
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-white text-lg font-bold ring-1 ring-neutral-200 active:scale-95"
            >
              <X className="size-6" /> No
            </button>
            <button
              type="button"
              onClick={() => vote(true)}
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-rose-500 text-lg font-bold text-[#fff] active:scale-95"
            >
              <Heart className="size-6 fill-current" /> Sì
            </button>
          </div>
        </div>
      ) : loading && done < session.product_ids.length ? (
        <p className="text-sm text-neutral-500">Caricamento prodotti…</p>
      ) : !matches ? (
        <div className="space-y-3 rounded-2xl bg-white p-5 text-center shadow-sm ring-1 ring-black/5">
          <p className="text-3xl">⏳</p>
          <p className="font-semibold">Hai finito!</p>
          <p className="text-sm text-neutral-600">Aspettiamo che {session.other.handle} finisca, poi vedete i prodotti piaciuti a entrambi.</p>
          <button type="button" onClick={reload} className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 underline">
            <RefreshCw className="size-4" /> Aggiorna
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-2xl bg-rose-500 p-5 text-center text-[#fff]">
            <p className="text-3xl">{matches.length > 0 ? '💞' : '🤷'}</p>
            <p className="text-lg font-bold">
              {matches.length === 0 ? 'Nessun match questa volta' : matches.length === 1 ? '1 match!' : `${matches.length} match!`}
            </p>
            <p className="text-sm opacity-90">
              {matches.length > 0 ? `Questi piacciono sia a te sia a ${session.other.handle}.` : 'Gusti diversi: riprovate con un altro mazzo.'}
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-3">
            {matches.map((p) => (
              <li key={p.id} className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
                <button type="button" onClick={() => openProduct(p)} className="aspect-square">
                  <ProductImage product={p} className="size-full bg-[#fff]" />
                </button>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <p className="line-clamp-2 text-sm font-medium">{p.title}</p>
                  <div className="mt-auto pt-1">
                    <PriceTag product={p} />
                  </div>
                  <StoreLink
                    product={p}
                    className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-full bg-neutral-900 px-3 py-2 text-sm font-semibold text-white"
                  >
                    Acquista
                  </StoreLink>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <a href={routeHref('amici')} className="block text-center text-sm font-medium text-neutral-600 underline">
        Torna ad Amici
      </a>
    </div>
  )
}

const SWIPE_DISTANCE = 110
const SWIPE_VELOCITY = 600

/** La carta di Swipe insieme: si trascina a destra (sì) o a sinistra (no) come nel mazzo; il tocco apre la scheda. */
function TogetherCard({ product, onSwipe }: { product: Product; onSwipe: (dir: 1 | -1) => void }) {
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-300, 0, 300], [-16, 0, 16])
  const likeOpacity = useTransform(x, [20, SWIPE_DISTANCE], [0, 1])
  const nopeOpacity = useTransform(x, [-SWIPE_DISTANCE, -20], [1, 0])
  const dragged = useRef(false)
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > SWIPE_DISTANCE || info.velocity.x > SWIPE_VELOCITY) onSwipe(1)
    else if (info.offset.x < -SWIPE_DISTANCE || info.velocity.x < -SWIPE_VELOCITY) onSwipe(-1)
    setTimeout(() => (dragged.current = false), 0)
  }
  return (
    <motion.div
      className="absolute inset-0 cursor-grab touch-pan-y overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5 active:cursor-grabbing"
      style={{ x, rotate }}
      drag="x"
      dragSnapToOrigin
      dragElastic={0.9}
      onDragStart={() => (dragged.current = true)}
      onDragEnd={onDragEnd}
      initial={{ scale: 0.96, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      variants={{
        exit: (dir: 1 | -1) => ({ x: dir * (window.innerWidth + 200), rotate: dir * 22, opacity: 0, transition: { duration: 0.32, ease: 'easeOut' } }),
      }}
      exit="exit"
      onClick={() => !dragged.current && openProduct(product)}
    >
      <ProductImage product={product} eager className="pointer-events-none h-[38dvh] w-full bg-[#fff]" />
      <div className="space-y-1 p-4 text-left">
        <p className="text-[11px] font-medium tracking-wide text-neutral-500 uppercase">{brandAndStore(product)}</p>
        <p className="line-clamp-2 font-semibold">{product.title}</p>
        <PriceTag product={product} />
      </div>
      <motion.span
        style={{ opacity: likeOpacity }}
        className="pointer-events-none absolute top-5 left-5 -rotate-12 rounded-xl border-4 border-emerald-500 px-3 py-1 text-2xl font-black text-emerald-500"
      >
        SÌ
      </motion.span>
      <motion.span
        style={{ opacity: nopeOpacity }}
        className="pointer-events-none absolute top-5 right-5 rotate-12 rounded-xl border-4 border-rose-500 px-3 py-1 text-2xl font-black text-rose-500"
      >
        NO
      </motion.span>
    </motion.div>
  )
}
