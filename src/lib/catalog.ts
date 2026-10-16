import { UNIVERSES, type Universe } from '../config/categories'
import { DATA_BASE, isNative } from './native'
import { loadOffline, saveOffline } from './offlineStore'
import { whenIdle, yieldToMain } from './idle'
import { buildExploreCards } from '../data/exploreCards'
import type { Product } from '../types/product'
import { isCategoryId } from '../config/categories'
import { STORES, isStoreId } from '../config/stores'

export interface CatalogResult {
  products: Product[]
  /** true se il catalogo verificato è vuoto e mostriamo le card "esplora" */
  exploreMode: boolean
  skipped: number
  /** Sezioni contenute: il build divide il catalogo per sezione per aprire l'app prima. */
  sections: Universe[]
}

/**
 * Sorgente del catalogo. Il build scrive `catalog-<sezione>.json` (compatti):
 * si scarica prima la sezione aperta, poi le altre. In sviluppo c'è solo `catalog.json` (tutto).
 */
export async function loadCatalog(
  section: Universe,
  signal?: AbortSignal,
  beforeParse?: () => Promise<void>,
  /** `after`: il download parte dopo questa promessa; `low`: passa dopo foto e anteprima se la rete è lenta. */
  opts: { after?: Promise<unknown>; low?: boolean } = {},
): Promise<CatalogResult> {
  await opts.after
  // Leggere il catalogo (alcuni MB) blocca il telefono per un attimo: chi chiama può farlo aspettare un momento libero,
  // così non capita in mezzo a uno swipe. Il file intanto si scarica a pezzi (tenerli costa poco); trasformarlo in
  // testo e poi in prodotti si fa dopo, in passi separati, così tra un passo e l'altro il telefono risponde ai tocchi.
  let bytes: Uint8Array
  let sections: Universe[] = [section]
  if (isNative) {
    const got = await fetchOrSaved(`catalog-${section}.json`, { signal, priority: opts.low ? 'low' : 'auto' }, 5000)
    if (!got) throw new Error('Catalogo non disponibile')
    bytes = got
  } else {
    let res = await fetch(`${DATA_BASE}catalog-${section}.json`, { signal, priority: opts.low ? 'low' : 'auto' })
    if (!res.ok) {
      res = await fetch(`${DATA_BASE}catalog.json`, { signal })
      sections = [...UNIVERSES]
    }
    if (!res.ok) throw new Error(`Catalogo non disponibile (HTTP ${res.status})`)
    bytes = await readBody(res)
  }
  await beforeParse?.()
  const text = new TextDecoder().decode(bytes)
  await yieldToMain()
  const parsed = await parseInPieces(text)
  const { valid, invalid } = await quickCheck(parsed)
  if (invalid) console.warn('Prodotti scartati dal catalogo:', invalid)
  const available = valid.filter((p) => p.availability !== 'out_of_stock')
  if (available.length === 0 && sections.length > 1) return { products: buildExploreCards(), exploreMode: true, skipped: invalid, sections }
  return { products: valid, exploreMode: false, skipped: invalid, sections }
}

/** Anteprima leggera della sezione (catalog-<sezione>-anteprima.json, vedi build-catalog): vuota se manca. */
export async function loadCatalogPreview(section: Universe, signal?: AbortSignal): Promise<Product[]> {
  let list: Record<string, unknown>[]
  if (isNative) {
    const bytes = await fetchOrSaved(`catalog-${section}-anteprima.json`, { signal, priority: 'high' }, 2500)
    if (!bytes) return []
    list = JSON.parse(new TextDecoder().decode(bytes))
  } else {
    const res = await fetch(`${DATA_BASE}catalog-${section}-anteprima.json`, { signal, priority: 'high' })
    if (!res.ok) return []
    list = await res.json()
  }
  return (await quickCheck(list)).valid.filter((p) => p.availability !== 'out_of_stock')
}

/**
 * Nell'app: file dal sito, salvato sul telefono a ogni download riuscito. Senza rete, o se il sito non risponde
 * entro `waitMs`, si usa la copia salvata (il download intanto continua e aggiorna la copia per la volta dopo).
 */
async function fetchOrSaved(file: string, init: RequestInit, waitMs: number): Promise<Uint8Array | null> {
  const net = fetch(`${DATA_BASE}${file}`, init)
    .then((res) => (res.ok ? readBody(res) : null))
    .then((bytes) => {
      // Salvato quando il telefono è libero (copiare alcuni MB costa un attimo).
      if (bytes) void whenIdle().then(() => saveOffline(file, bytes))
      return bytes
    })
  // Gestito subito: senza rete il download fallisce prima che la copia salvata sia letta.
  const netOrNull = net.catch(() => null)
  const saved = await loadOffline(file)
  if (!saved) return net
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), waitMs))
  const fresh = await Promise.race([netOrNull, timeout])
  return fresh ?? saved
}

/**
 * Controllo veloce: il controllo completo (src/lib/validate.ts) lo fa il build in scripts/build-catalog.ts.
 * Qui si scartano solo voci rotte, doppioni e negozi o categorie che questa versione dell'app non conosce.
 */
async function quickCheck(list: Record<string, unknown>[]) {
  const valid: Product[] = []
  const seen = new Set<string>()
  for (let i = 0; i < list.length; i++) {
    // A blocchi, con una pausa ogni tanto: su decine di migliaia di prodotti i telefoni economici si bloccavano.
    if (i && i % CHECK_SLICE === 0) await yieldToMain()
    const p = expand(list[i])
    const ok =
      typeof p.id === 'string' && !seen.has(p.id) && typeof p.title === 'string' && typeof p.addedAt === 'string' &&
      typeof p.category === 'string' && isCategoryId(p.category) && typeof p.store === 'string' && isStoreId(p.store) && STORES[p.store].enabled
    if (!ok) continue
    seen.add(p.id as string)
    valid.push(p as unknown as Product)
  }
  return { valid, invalid: list.length - valid.length }
}
const CHECK_SLICE = 8000

/** Circa quanti caratteri leggere per volta (~2 MB: sui telefoni economici ~150 ms invece di un blocco unico). */
const PIECE = 2_000_000

/**
 * Il build scrive un prodotto per riga (`[\n{…},\n{…}\n]`): si legge a pezzi di righe intere, con una pausa tra un pezzo
 * e l'altro. Un file scritto diversamente (versioni vecchie, sviluppo) si legge tutto in una volta.
 */
async function parseInPieces(text: string): Promise<Record<string, unknown>[]> {
  if (text.length <= PIECE || !text.startsWith('[\n{')) return JSON.parse(text)
  try {
    const out: Record<string, unknown>[] = []
    let start = 2
    while (start < text.length) {
      const cut = text.indexOf('\n{', start + PIECE)
      let piece = cut < 0 ? text.slice(start, text.lastIndexOf(']')) : text.slice(start, cut)
      piece = piece.trimEnd()
      if (piece.endsWith(',')) piece = piece.slice(0, -1)
      const list = JSON.parse(`[${piece}]`) as Record<string, unknown>[]
      for (const p of list) out.push(p)
      if (cut < 0) break
      start = cut + 1
      await yieldToMain()
    }
    return out
  } catch {
    return JSON.parse(text)
  }
}

/** Ricostruisce i campi tolti dal build per risparmiare peso (vedi scripts/build-catalog.ts). */
// Modifica l'oggetto appena letto dal JSON invece di copiarlo: con decine di migliaia di prodotti la copia pesa.
function expand(p: Record<string, unknown>) {
  if (p.externalId === undefined && typeof p.id === 'string') p.externalId = p.id.slice(p.id.indexOf(':') + 1)
  if (p.availability === undefined) p.availability = 'in_stock'
  return p
}

async function readBody(res: Response): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(await res.arrayBuffer())
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.length
  }
  const out = new Uint8Array(size)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return out
}
