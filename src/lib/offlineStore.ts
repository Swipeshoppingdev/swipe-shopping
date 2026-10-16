/**
 * Copia dei file del catalogo sul telefono (IndexedDB), per l'app Android/iPhone che non ha il service worker del sito:
 * l'app si apre con le carte dell'ultima volta anche senza rete o con rete lentissima, e intanto si aggiorna.
 * I prezzi vecchi non si vedono comunque (valgono 24 ore, vedi src/lib/price.ts).
 */
const DB = 'swipeshop-offline'
const STORE = 'files'

let db: Promise<IDBDatabase | null> | null = null
function open() {
  db ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return db
}

export async function loadOffline(key: string): Promise<Uint8Array | null> {
  const d = await open()
  if (!d) return null
  return new Promise((resolve) => {
    try {
      const req = d.transaction(STORE).objectStore(STORE).get(key)
      req.onsuccess = () => resolve(req.result instanceof Uint8Array ? req.result : null)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function saveOffline(key: string, bytes: Uint8Array) {
  const d = await open()
  if (!d) return
  try {
    d.transaction(STORE, 'readwrite').objectStore(STORE).put(bytes, key)
  } catch {
    // Spazio finito o archivio non disponibile: la prossima volta si riscarica, come prima.
  }
}
