import { motion } from 'framer-motion'
import { Check, Target, Trophy, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ProductImage } from '../components/ProductImage'
import { Avatar, LoginNeeded, useProductsById } from '../components/SocialBits'
import { formatPrice } from '../lib/price'
import { priceOptions, seeded } from '../lib/priceGame'
import { openProduct } from '../lib/productSheet'
import { hashParam, social, type PriceChallenge } from '../lib/social'
import { routeHref } from '../lib/useHashRoute'
import { useAuth } from '../state/AuthState'

/**
 * Sfida "Indovina il prezzo" tra amici (#/sfida/<id>): gli stessi prodotti con le stesse 3 opzioni per tutti.
 * Si gioca una volta sola; la classifica si vede dopo aver giocato.
 */
export function ChallengePage() {
  const auth = useAuth()
  const [id] = useState(() => hashParam('sfida'))
  const [ch, setCh] = useState<PriceChallenge | null | undefined>(id ? undefined : null)
  const [error, setError] = useState('')
  const { products, loading } = useProductsById(ch?.product_ids)
  const userId = auth.user?.id

  const reload = useCallback(async () => {
    if (!id) return
    try {
      setCh(await social.challenge(id))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [id])
  useEffect(() => {
    if (userId) void Promise.resolve().then(reload)
  }, [reload, userId])

  // Opzioni uguali per tutti: il seme è la sfida + il prodotto. Si saltano i prodotti senza prezzo aggiornato.
  const rounds = useMemo(
    () =>
      ch
        ? products.flatMap((p) => {
            const o = priceOptions(p, seeded(`${ch.id}:${p.id}`))
            return o ? [{ product: p, ...o }] : []
          })
        : [],
    [ch, products],
  )

  if (!auth.ready) return <p className="py-10 text-center text-neutral-500">Caricamento…</p>
  if (!auth.user) return <LoginNeeded text="Accedi per giocare la sfida con i tuoi amici." />
  if (error) return <p className="py-10 text-center text-neutral-500">{error}</p>
  if (ch === undefined || (ch && loading)) return <p className="py-10 text-center text-neutral-500">Caricamento…</p>
  if (!ch) return <p className="py-10 text-center text-neutral-500">Questa sfida non esiste più.</p>
  if (ch.my_score === null) {
    if (rounds.length < 3)
      return <p className="py-10 text-center text-neutral-500">I prezzi di questa sfida non sono aggiornati in questo momento: riprova più tardi.</p>
    return <Play ch={ch} rounds={rounds} onDone={reload} />
  }
  return <Results ch={ch} productIds={ch.product_ids} />
}

type Round = { product: import('../types/product').Product; price: number; options: number[] }

function Play({ ch, rounds, onDone }: { ch: PriceChallenge; rounds: Round[]; onDone: () => Promise<void> }) {
  const [i, setI] = useState(0)
  const [score, setScore] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const r = rounds[i]
  const choose = (o: number) => {
    if (picked !== null) return
    const right = o === r.price
    setPicked(o)
    navigator.vibrate?.(right ? [10, 40, 10] : 30)
    const next = score + (right ? 1 : 0)
    setScore(next)
    setTimeout(async () => {
      if (i + 1 < rounds.length) {
        setI(i + 1)
        setPicked(null)
        return
      }
      setSaving(true)
      try {
        await social.challengePlay(ch.id, next)
      } finally {
        await onDone()
      }
    }, 1200)
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="text-center">
        <p className="flex items-center justify-center gap-2 text-xl font-black">
          <Target className="size-5 text-rose-500" /> {ch.is_creator ? 'La tua sfida' : `Sfida di ${ch.creator.handle}`}
        </p>
        <p className="text-sm text-neutral-500">
          Prodotto {i + 1} di {rounds.length} · Giusti: <strong className="text-neutral-900">{score}</strong>
        </p>
      </div>
      <motion.div key={r.product.id} initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="relative min-h-56 flex-1 overflow-hidden rounded-2xl bg-[#fff] shadow-md">
          <ProductImage product={r.product} eager className="absolute inset-0 size-full object-contain p-3" />
        </div>
        <p className="line-clamp-2 px-2 text-center text-sm font-medium">{r.product.title}</p>
      </motion.div>
      <div className="grid grid-cols-3 gap-2">
        {r.options.map((o) => {
          const isReal = o === r.price
          const st = picked === null ? 'idle' : isReal ? 'right' : picked === o ? 'wrong' : 'off'
          return (
            <motion.button
              key={`${r.product.id}:${o}`}
              type="button"
              disabled={picked !== null}
              onClick={() => choose(o)}
              animate={st === 'wrong' ? { x: [0, -6, 6, -4, 4, 0] } : st === 'right' ? { scale: [1, 1.08, 1] } : {}}
              className={`flex h-12 items-center justify-center gap-1 rounded-2xl text-base font-bold ring-1 ${
                st === 'right'
                  ? 'bg-emerald-500 text-[#fff] ring-emerald-500'
                  : st === 'wrong'
                    ? 'bg-neutral-200 text-neutral-400 line-through ring-neutral-200'
                    : st === 'off'
                      ? 'bg-white text-neutral-300 ring-neutral-200'
                      : 'bg-white text-neutral-900 ring-neutral-200 active:scale-95'
              }`}
            >
              {st === 'right' && <Check className="size-4" />}
              {st === 'wrong' && <X className="size-4" />}
              {formatPrice(o)}
            </motion.button>
          )
        })}
      </div>
      <p className="h-5 text-center text-sm font-semibold">{saving ? 'Salvo il risultato…' : ''}</p>
    </div>
  )
}

function Results({ ch, productIds }: { ch: PriceChallenge; productIds: string[] }) {
  const { products } = useProductsById(productIds)
  const players = ch.players ?? []
  const waiting = Math.max(0, ch.invited + 1 - players.length)
  const medal = ['🥇', '🥈', '🥉']
  return (
    <div className="space-y-4 pb-6">
      <div className="text-center">
        <Trophy className="mx-auto size-10 text-amber-500" />
        <h1 className="mt-1 text-2xl font-black">Hai fatto {ch.my_score} su {productIds.length}</h1>
        <p className="text-sm text-neutral-500">
          {waiting > 0 ? `${waiting} ${waiting === 1 ? 'amico deve' : 'amici devono'} ancora giocare: torna a vedere la classifica` : 'Hanno giocato tutti!'}
        </p>
      </div>
      <ol className="space-y-2">
        {players.map((p, n) => (
          <li
            key={p.code}
            className={`flex items-center gap-3 rounded-2xl p-3 shadow-sm ring-1 ${p.me ? 'bg-rose-50 ring-rose-200' : 'bg-white ring-black/5'}`}
          >
            <span className="w-6 text-center text-lg font-black">{medal[n] ?? n + 1}</span>
            <Avatar emoji={p.avatar} size="sm" />
            <span className="flex-1 truncate font-semibold">{p.me ? 'Tu' : p.handle}</span>
            <span className="text-lg font-black">
              {p.score}/{productIds.length}
            </span>
          </li>
        ))}
      </ol>
      <div>
        <h2 className="mb-2 font-semibold">I prodotti della sfida</h2>
        <div className="grid grid-cols-3 gap-2">
          {products.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => openProduct(p)}
              className="relative aspect-square overflow-hidden rounded-xl bg-[#fff] shadow-sm ring-1 ring-black/5"
            >
              <ProductImage product={p} className="absolute inset-0 size-full object-contain p-1.5 [&_span]:text-3xl" />
            </button>
          ))}
        </div>
      </div>
      <a href={routeHref('amici')} className="block rounded-full bg-neutral-900 py-3 text-center font-semibold text-white active:scale-95">
        Sfida altri amici
      </a>
    </div>
  )
}
