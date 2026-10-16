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
  let bytes: Uint8Array[]
  let sections: Universe[] = [section]
  if (isNative) {
    const got = await fetchOrSaved(`catalog-${section}.json`, { signal, priority: opts.low ? 'low' : 'auto' }, 5000)
    if (!got) throw new Error('Catalogo non disponibile')
    bytes = [got]
  } else {
    let res = await fetch(`${DATA_BASE}catalog-${section}.json`, { signal, priority: opts.low ? 'low' : 'auto' })
    if (!res.ok) {
      res = await fetch(`${DATA_BASE}catalog.json`, { signal })
      sections = [...UNIVERSES]
    }
    if (!res.ok) throw new Error(`Catalogo non disponibile (HTTP ${res.status})`)
    bytes = await readChunks(res)
  }
  await beforeParse?.()
  const parsed = await parseInPieces(bytes)
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

/** Ricostruisce i campi tolti dal build per risparmiare peso (vedi scripts/build-catalog.ts). */
// Modifica l'oggetto appena letto dal JSON invece di copiarlo: con decine di migliaia di prodotti la copia pesa.
function expand(p: Record<string, unknown>) {
  if (p.externalId === undefined && typeof p.id === 'string') p.externalId = p.id.slice(p.id.indexOf(':') + 1)
  if (p.availability === undefined) p.availability = 'in_stock'
  return p
}

/** Il file come arriva dalla rete, a pezzi: unirli in un blocco unico costava ~0,2 s sui telefoni lenti. */
async function readChunks(res: Response): Promise<Uint8Array[]> {
  if (!res.body) return [new Uint8Array(await res.arrayBuffer())]
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  return chunks
}

/**
 * Da byte a prodotti a piccoli passi, con una pausa tra l'uno e l'altro. Il build scrive un prodotto per riga
 * (`[\n{…},\n{…}\n]`): ogni pezzo di testo si legge fino all'ultima riga intera, il resto passa al pezzo dopo.
 * Prima si trasformava tutto il file (10 MB di moda) in un testo unico: sui telefoni lenti bloccava lo schermo per più
 * di un secondo, proprio durante i primi swipe. Un file scritto diversamente (versioni vecchie, sviluppo) si legge
 * tutto in una volta.
 */
async function parseInPieces(parts: Uint8Array[]): Promise<Record<string, unknown>[]> {
  const decoder = new TextDecoder()
  const out: Record<string, unknown>[] = []
  const take = (lines: string) => {
    lines = lines.trimEnd()
    if (lines.startsWith('[')) lines = lines.slice(1)
    if (lines.endsWith(',')) lines = lines.slice(0, -1)
    if (!lines.trim()) return
    for (const p of JSON.parse(`[${lines}]`) as Record<string, unknown>[]) out.push(p)
  }
  let carry = ''
  let byLine: boolean | undefined
  try {
    for (const part of parts) {
      for (let off = 0; off < part.length; off += PIECE) {
        // stream: un carattere spezzato tra due pezzi viene completato col pezzo dopo.
        carry += decoder.decode(part.subarray(off, off + PIECE), { stream: true })
        if (byLine === undefined && carry.length >= 3) byLine = carry.startsWith('[\n{')
        if (!byLine) continue
        const cut = carry.lastIndexOf('\n{')
        if (cut <= 0) continue
        take(carry.slice(0, cut))
        carry = carry.slice(cut + 1)
        await yieldToMain()
      }
    }
    carry += decoder.decode()
    if (!byLine) return JSON.parse(carry)
    take(carry.slice(0, carry.lastIndexOf(']')))
    return out
  } catch {
    // Formato inatteso: lettura classica, tutto insieme.
    const all = new TextDecoder().decode(await new Blob(parts as BlobPart[]).arrayBuffer())
    return JSON.parse(all)
  }
}
/** Byte letti per volta (~256 KB: sui telefoni lenti qualche decina di millisecondi). */
const PIECE = 256 * 1024

async function readBody(res: Response): Promise<Uint8Array> {
  const chunks = await readChunks(res)
  if (chunks.length === 1) return chunks[0]
  let size = 0
  for (const c of chunks) size += c.length
  const out = new Uint8Array(size)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return out
}
