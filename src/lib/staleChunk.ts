const STALE = /dynamically imported module|Importing a module script failed|Failed to load module script/i

/** Errore di un file JS che non esiste più: il sito è stato aggiornato mentre la pagina era aperta. */
export const isStaleChunk = (e: unknown) => STALE.test(e instanceof Error ? e.message : String(e))

// Ricarica già partita in questa pagina: gli errori che arrivano subito dopo (lo stesso file mancante visto
// sia da vite:preloadError sia da React) non vanno nel registro, la pagina si sta già ricaricando.
let reloading = false

/** La pagina si sta ricaricando per prendere i file nuovi: niente schermata d'errore né errori nel registro. */
export const isReloading = () => reloading

/** Ricarica la pagina per prendere i file nuovi, al massimo una volta ogni 30 secondi (niente ricariche a catena). */
export function reloadForUpdate() {
  if (reloading) return true
  try {
    if (Date.now() - Number(sessionStorage.getItem('staleReload') ?? 0) < 30_000) return false
    sessionStorage.setItem('staleReload', String(Date.now()))
  } catch {
    return false
  }
  reloading = true
  // Indirizzo nuovo (?u=…): Safari non può ridare la pagina vecchia dalla sua cache, che punta ancora ai file spariti.
  const q = new URLSearchParams(location.search)
  q.set('u', String(Date.now()))
  location.replace(`${location.pathname}?${q}${location.hash}`)
  return true
}

/** Toglie dall'indirizzo il ?u=… messo da reloadForUpdate (resta solo quello che serve, es. ?sezione). */
export function cleanReloadParam() {
  const q = new URLSearchParams(location.search)
  if (!q.has('u')) return
  q.delete('u')
  history.replaceState(history.state, '', `${location.pathname}${q.size ? `?${q}` : ''}${location.hash}`)
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Pezzo dell'app scaricato quando serve (React.lazy). Se non arriva:
 * - sito aggiornato nel frattempo: la pagina si ricarica e intanto resta la schermata di attesa (niente errore);
 * - rete che va e viene: si riprova una volta dopo 1,5 secondi prima di arrendersi.
 */
export function loadChunk<T>(load: () => Promise<T>): () => Promise<T> {
  const never = () => new Promise<T>(() => {})
  return () =>
    load().catch(async (err) => {
      if (reloading) return never()
      await wait(1500)
      try {
        return await load()
      } catch (err2) {
        if (reloading || (isStaleChunk(err2) && reloadForUpdate())) return never()
        throw err2 ?? err
      }
    })
}
