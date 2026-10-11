import { useEffect, useState } from 'react'

/** Routing via hash: funziona su qualsiasi hosting statico e dentro Capacitor. */
export const ROUTES = ['scopri', 'preferiti', 'filtri', 'profilo', 'privacy', 'admin', 'lista', 'amici', 'u', 'sondaggio', 'regalo', 'insieme', 'segreto', 'chat', 'outfit', 'studio'] as const
export type Route = (typeof ROUTES)[number]

const parse = (hash: string): Route => {
  const r = hash.replace(/^#\/?/, '')
  if (r.startsWith('p/')) return 'scopri' // prodotto condiviso: si apre in Scopri
  if (r.startsWith('lista/')) return 'lista' // cartella di preferiti condivisa
  if (r.startsWith('outfit/')) return 'outfit' // #/outfit/salvati
  // Social: profilo di un amico, sondaggio, lista regalo, Swipe insieme, Babbo Natale segreto (#/u/<codice>, #/sondaggio/<id>…)
  for (const prefix of ['u', 'sondaggio', 'regalo', 'insieme', 'segreto', 'chat'] as const) if (r.startsWith(`${prefix}/`)) return prefix
  return (ROUTES as readonly string[]).includes(r) ? (r as Route) : 'scopri'
}

/** Pagina aperta e indirizzo completo (cambia anche tra due sondaggi o due profili). */
export function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return { route: parse(hash), hash }
}

export const routeHref = (r: Route) => `#/${r}`
