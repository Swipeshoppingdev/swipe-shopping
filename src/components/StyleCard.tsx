import { motion } from 'framer-motion'
import { Share2, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { colorSwatch } from '../config/colors'
import { shareText } from '../lib/share'
import { load, save } from '../lib/storage'
import { STYLES, STYLE_MIN, styleDna, styleShareText, weekKey, type StyleDna, type StyleId } from '../lib/styleDna'
import { useApp } from '../state/AppState'
import type { Product } from '../types/product'

export function useStyleDna() {
  const { wishlist } = useApp()
  return useMemo(() => styleDna(wishlist.map((w) => w.product as Product)), [wishlist])
}

type Weeks = Record<string, Partial<Record<StyleId, number>>>

/** Percentuali della settimana scorsa (le ultime salvate prima di questa), per mostrare come cambia lo stile. */
function useLastWeek(dna: StyleDna) {
  const week = weekKey()
  const [prev] = useState(() => {
    const weeks = load<Weeks>('styleWeeks', {})
    const older = Object.keys(weeks).filter((k) => k !== week).sort()
    return older.length ? weeks[older[older.length - 1]] : null
  })
  useEffect(() => {
    if (dna.count < STYLE_MIN) return
    const weeks = load<Weeks>('styleWeeks', {})
    weeks[week] = Object.fromEntries(dna.shares.map((s) => [s.id, s.pct]))
    // Solo le ultime 8 settimane.
    const keep = Object.keys(weeks).sort().slice(-8)
    save('styleWeeks', Object.fromEntries(keep.map((k) => [k, weeks[k]])))
  }, [dna, week])
  return prev
}

/** "Il tuo stile": il ritratto con le barre, il colore e la marca preferiti. Nel Profilo e nella rivelazione. */
export function StyleCard({ animate = false }: { animate?: boolean }) {
  const dna = useStyleDna()
  const prev = useLastWeek(dna)
  const [shared, setShared] = useState('')

  if (dna.count < STYLE_MIN) {
    const left = STYLE_MIN - dna.count
    return (
      <div className="space-y-2">
        <p className="text-sm text-neutral-600">
          Dai ancora <b>{left}</b> "Sì" nella Moda e scopri il tuo stile: street, minimal, elegante…
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
          <div className="h-full rounded-full bg-rose-500 transition-all" style={{ width: `${(dna.count / STYLE_MIN) * 100}%` }} />
        </div>
        <a href="#/scopri" className="inline-block text-sm font-semibold text-rose-600 underline">
          Vai a swipare
        </a>
      </div>
    )
  }

  const main = STYLES[dna.shares[0].id]
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl text-3xl" style={{ background: `${main.color}22` }} aria-hidden>
          {main.emoji}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Sei soprattutto</p>
          <p className="text-2xl leading-tight font-black" style={{ color: main.color }}>
            {main.label}
          </p>
          <p className="text-sm text-neutral-600">{main.text}</p>
        </div>
      </div>
      <ul className="space-y-2">
        {dna.shares.slice(0, 4).map((s, i) => {
          const st = STYLES[s.id]
          const delta = prev ? s.pct - (prev[s.id] ?? 0) : 0
          return (
            <li key={s.id} className="text-sm">
              <div className="mb-1 flex justify-between">
                <span className="font-medium">
                  {st.emoji} {st.label}
                </span>
                <span className="tabular-nums">
                  {delta !== 0 && (
                    <span className={`mr-1.5 text-xs font-semibold ${delta > 0 ? 'text-emerald-600' : 'text-neutral-400'}`}>
                      {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}
                    </span>
                  )}
                  <b>{s.pct}%</b>
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-neutral-100">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: st.color }}
                  initial={{ width: animate ? 0 : `${s.pct}%` }}
                  animate={{ width: `${s.pct}%` }}
                  transition={{ duration: 0.8, delay: animate ? 0.3 + i * 0.25 : 0, ease: 'easeOut' }}
                />
              </div>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap gap-2 text-xs">
        {dna.color && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 font-medium">
            <span className="size-3 rounded-full ring-1 ring-black/10" style={{ background: colorSwatch(dna.color) }} />
            Colore: {dna.color}
          </span>
        )}
        {dna.brand && <span className="rounded-full bg-neutral-100 px-3 py-1.5 font-medium">Marca del cuore: {dna.brand}</span>}
        {dna.budget !== undefined && <span className="rounded-full bg-neutral-100 px-3 py-1.5 font-medium">Budget tipico: {dna.budget} €</span>}
      </div>
      <p className="text-xs text-neutral-500">
        Fatto con i tuoi {dna.count} preferiti di Moda{prev ? ': le frecce sono il confronto con la settimana scorsa' : ''}. Cambia mentre swipi.
      </p>
      <button
        type="button"
        onClick={async () => {
          const r = await shareText(styleShareText(dna))
          setShared(r === 'copied' ? 'Testo copiato!' : '')
        }}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-neutral-900 text-sm font-semibold text-white active:scale-95"
      >
        <Share2 className="size-4" /> Condividi il tuo stile
      </button>
      {shared && <p className="text-center text-xs text-neutral-500">{shared}</p>}
    </div>
  )
}

/**
 * Rivelazione a tutto schermo: la prima volta che si arriva a STYLE_MIN "Sì" in Moda,
 * poi ogni 25 "Sì" in più ("Il tuo stile è cambiato"). Solo nella Moda.
 */
export function StyleReveal() {
  const { state } = useApp()
  const dna = useStyleDna()
  const [shownAt, setShownAt] = useState(() => load<number>('styleRevealAt', 0))
  const due = state.mode === 'moda' && dna.count >= STYLE_MIN && (shownAt === 0 || dna.count >= shownAt + 25)
  const [open, setOpen] = useState(false)
  const first = shownAt === 0

  useEffect(() => {
    if (!due || open) return
    // Dopo lo swipe, non durante (la carta ha il tempo di uscire), e mai sopra un duello.
    const t = setInterval(() => {
      if (!document.querySelector('[data-break]')) {
        clearInterval(t)
        setOpen(true)
      }
    }, 800)
    return () => clearInterval(t)
  }, [due, open])

  const close = () => {
    save('styleRevealAt', dna.count)
    setShownAt(dna.count)
    setOpen(false)
  }
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 backdrop-blur-sm sm:items-center" onClick={close}>
      <motion.div
        initial={{ y: 60, opacity: 0, scale: 0.96 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-3 flex items-center gap-2 text-sm font-bold text-rose-500">
          <Sparkles className="size-4" /> {first ? 'Abbiamo capito il tuo stile!' : 'Il tuo stile è cambiato'}
        </p>
        <StyleCard animate />
        <button type="button" onClick={close} className="mt-3 h-11 w-full rounded-full text-sm font-semibold text-neutral-600 active:bg-neutral-100">
          Continua a swipare
        </button>
        <p className="text-center text-xs text-neutral-400">Lo ritrovi sempre nel Profilo.</p>
      </motion.div>
    </div>
  )
}
