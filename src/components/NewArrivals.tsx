import { AnimatePresence, m as motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { sectionOf } from '../config/categories'
import { isNew } from '../lib/newness'
import { load, save } from '../lib/storage'
import { useApp } from '../state/AppState'

/**
 * All'apertura di una sezione: "+85 nuovi in Moda dalla tua ultima visita" per qualche secondo.
 * I nuovi sono già i primi del mazzo: questo serve solo a dirlo. Montato con key = sezione.
 */
export function NewArrivals() {
  const { state, deck } = useApp()
  const key = `lastVisit:${state.mode}`
  const [since] = useState(() => load<number | null>(key, null))
  const [visible, setVisible] = useState(true)
  const count = useMemo(
    () => (since === null ? 0 : deck.filter((p) => isNew(p) && Date.parse(p.addedAt) > since).length),
    [deck, since],
  )

  useEffect(() => {
    save(key, Date.now())
    const t = setTimeout(() => setVisible(false), 5000)
    return () => clearTimeout(t)
  }, [key])

  return (
    <AnimatePresence>
      {visible && count > 0 && (
        <motion.button
          type="button"
          onClick={() => setVisible(false)}
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          className="absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold whitespace-nowrap text-[#fff] shadow-lg"
        >
          <Sparkles className="size-4" />
          {count === 1 ? '1 nuovo' : `${count.toLocaleString('it-IT')} nuovi`} in {sectionOf(state.mode).label} dalla tua ultima visita
        </motion.button>
      )}
    </AnimatePresence>
  )
}
