import { AnimatePresence, motion } from 'framer-motion'
import { Heart } from 'lucide-react'

export interface Burst {
  id: number
  /** Sconto vero del prodotto salvato: dal 30% in su l'esplosione è più grande */
  discount: number | null
}

/** Esplosione di cuori al centro della carta quando si dice "Sì". Solo decorazione: non blocca i tocchi. */
export function HeartBurst({ bursts }: { bursts: Burst[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden>
      <AnimatePresence>
        {bursts.map((b) => {
          const big = (b.discount ?? 0) >= 30
          const n = big ? 16 : 8
          return (
            <motion.div key={b.id} className="absolute top-1/2 left-1/2" exit={{ opacity: 0 }}>
              {Array.from({ length: n }, (_, i) => {
                const angle = (i / n) * Math.PI * 2 + (b.id % 7) * 0.3
                const dist = (big ? 150 : 95) * (0.7 + ((i * 37) % 10) / 25)
                const size = big ? 18 + ((i * 13) % 14) : 14 + ((i * 13) % 10)
                return (
                  <motion.span
                    key={i}
                    className="absolute"
                    style={{ marginLeft: -size / 2, marginTop: -size / 2 }}
                    initial={{ x: 0, y: 0, scale: 0.3, opacity: 1 }}
                    animate={{ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist - 30, scale: 1, opacity: 0, rotate: (i % 2 ? 1 : -1) * 25 }}
                    transition={{ duration: big ? 1.1 : 0.8, ease: 'easeOut' }}
                  >
                    <Heart style={{ width: size, height: size }} className={`fill-current ${i % 3 === 0 ? 'text-[#fb7185]' : 'text-[#f43f5e]'}`} />
                  </motion.span>
                )
              })}
              {big && (
                <motion.span
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f43f5e] px-4 py-2 text-2xl font-black whitespace-nowrap text-[#fff] shadow-xl"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: [0, 1.3, 1, 1], opacity: [0, 1, 1, 0] }}
                  transition={{ duration: 1.3, times: [0, 0.25, 0.75, 1] }}
                >
                  Super offerta! 🔥
                </motion.span>
              )}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
