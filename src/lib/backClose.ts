import { useEffect, useRef } from 'react'

/**
 * Tasto Indietro (Android, nell'app e nel browser) e gesto indietro di iPhone: chiudono la scheda o il menu aperto
 * invece di cambiare pagina o uscire dall'app. Aprendoli si aggiunge un passo alla cronologia (stesso indirizzo);
 * chiudendoli col pulsante quel passo si toglie.
 */
type Entry = { id: number; close: () => void }
const stack: Entry[] = []
let nextId = 1
// Passi tolti da noi (history.back dopo una chiusura col pulsante): non devono chiudere altro.
let ignorePop = 0

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignorePop) {
      ignorePop--
      return
    }
    stack.pop()?.close()
  })
}

/** Finché `open` è vero, Indietro chiama `close` invece di tornare alla pagina prima. */
export function useBackClose(open: boolean, close: () => void) {
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  })
  useEffect(() => {
    if (!open) return
    const entry: Entry = { id: nextId++, close: () => closeRef.current() }
    stack.push(entry)
    history.pushState({ ...(history.state as object | null), backClose: entry.id }, '')
    return () => {
      const i = stack.indexOf(entry)
      // Già tolto: chiuso proprio con Indietro.
      if (i < 0) return
      stack.splice(i, 1)
      // Dopo il click: se la chiusura viene da un link (nuova pagina), il passo in cima non è più il nostro e si lascia stare,
      // altrimenti tornare indietro annullerebbe la pagina appena aperta.
      setTimeout(() => {
        if ((history.state as { backClose?: number } | null)?.backClose !== entry.id) return
        ignorePop++
        history.back()
      }, 0)
    }
  }, [open])
}
