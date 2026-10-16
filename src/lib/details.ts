/**
 * Dettagli dei prodotti (foto aggiuntive e caratteristiche) in file separati dal catalogo:
 * public/details/<n>.json, scaricati solo quando servono. Il catalogo resta leggero.
 * Questo file non importa nulla: lo usa anche lo script di sincronizzazione.
 */
export interface ProductDetails {
  /** Foto aggiuntive, oltre a quella principale */
  images?: string[]
  /** Punti elenco delle caratteristiche (dal negozio) */
  features?: string[]
}

export const DETAIL_SHARDS = 64
/** Gli stessi dettagli in file piccoli (details/p/<n>.json), scritti dal build: vedi scripts/build-catalog.ts. */
export const SMALL_SHARDS = 1024

export function detailShard(id: string, shards = DETAIL_SHARDS) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % shards
}

const shards = new Map<number, Promise<Record<string, ProductDetails>>>()

export function loadDetails(id: string): Promise<ProductDetails | null> {
  const n = detailShard(id, SMALL_SHARDS)
  let shard = shards.get(n)
  if (!shard) {
    // Il file piccolo (~3 KB invece di ~40 KB per carta); se manca (sviluppo) quello grande.
    shard = fetch(`${base()}details/p/${n}.json`)
      .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r : fetch(`${base()}details/${detailShard(id)}.json`)))
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => {
        shards.delete(n) // offline: riprovo la prossima volta
        return {}
      })
    shards.set(n, shard)
  }
  return shard.then((s) => s[id] ?? null)
}

/** Nell'app Android/iOS i dettagli arrivano dal sito online (come in src/lib/native.ts, senza importarlo). */
function base() {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return cap?.isNativePlatform?.() ? 'https://swipeshopping.app/' : './'
}
