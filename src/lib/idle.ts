// Ultimo tocco o tasto: i lavori pesanti (leggere un catalogo) aspettano che l'utente si fermi un attimo,
// così non bloccano uno swipe a metà.
let lastInput = 0
if (typeof window !== 'undefined') {
  for (const type of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchmove'] as const) {
    window.addEventListener(type, () => (lastInput = performance.now()), { passive: true, capture: true })
  }
}

const QUIET_MS = 700
const MAX_WAIT_MS = 5000

/** Si risolve quando l'utente non tocca lo schermo da QUIET_MS (o dopo MAX_WAIT_MS al massimo) e il telefono è libero. */
export function whenIdle() {
  const start = performance.now()
  return new Promise<void>((resolve) => {
    const check = () => {
      const now = performance.now()
      const quietFor = now - Math.max(lastInput, start - QUIET_MS)
      if (quietFor >= QUIET_MS || now - start >= MAX_WAIT_MS) {
        if ('requestIdleCallback' in window) requestIdleCallback(() => resolve(), { timeout: 300 })
        else resolve()
      } else setTimeout(check, QUIET_MS - quietFor + 20)
    }
    check()
  })
}
