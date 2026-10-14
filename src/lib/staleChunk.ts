const STALE = /dynamically imported module|Importing a module script failed|Failed to load module script/i

/** Errore di un file JS che non esiste più: il sito è stato aggiornato mentre la pagina era aperta. */
export const isStaleChunk = (e: unknown) => STALE.test(e instanceof Error ? e.message : String(e))

/** Ricarica la pagina per prendere i file nuovi, al massimo una volta ogni 30 secondi (niente ricariche a catena). */
export function reloadForUpdate() {
  try {
    if (Date.now() - Number(sessionStorage.getItem('staleReload') ?? 0) < 30_000) return false
    sessionStorage.setItem('staleReload', String(Date.now()))
  } catch {
    return false
  }
  location.reload()
  return true
}
