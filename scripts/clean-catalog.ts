// Pulizia del catalogo dopo ogni aggiornamento: toglie i prodotti con la foto rotta e i doppioni.
// - Foto rotta: l'indirizzo non risponde, non è un'immagine o è minuscola (Amazon a volte dà un GIF 1x1).
// - Doppioni: stessa foto, oppure stesso negozio, marca e titolo. Si tiene il prodotto migliore
//   (disponibile, con prezzo aggiornato, il primo arrivato).
// - Taglie: le varianti di taglia dello stesso articolo (stessa foto, titolo che finisce con ", M") diventano
//   un solo prodotto con l'elenco delle taglie viste disponibili (src/lib/sizes.ts).
// Se troppe foto risultano rotte insieme è un problema di rete, non delle foto: allora non si toglie niente per le foto.
import { readFileSync, writeFileSync } from 'node:fs'
import { sortSizes, splitSize } from '../src/lib/sizes.ts'
import type { Product } from '../src/types/product.ts'

const file = new URL('../public/catalog.json', import.meta.url)
const catalog = JSON.parse(readFileSync(file, 'utf8')) as Product[]
const CONCURRENCY = 32
const MIN_BYTES = 1000
/** Oltre questa quota di foto rotte nello stesso giro si sospetta la rete */
const MAX_BROKEN_SHARE = 0.05

const annotate = (level: 'notice' | 'warning', msg: string) => console.log(`::${level}::${msg}`)

async function imageOk(url: string): Promise<boolean | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10_000) })
      if (res.status === 404 || res.status === 410) return false
      if (!res.ok) continue
      const type = res.headers.get('content-type') ?? ''
      const size = Number(res.headers.get('content-length') ?? MIN_BYTES)
      return type.startsWith('image/') && size >= MIN_BYTES
    } catch {
      // timeout o rete: si riprova una volta
    }
  }
  return null // non si sa: il prodotto resta
}

async function checkImages(products: Product[]) {
  const urls = [...new Set(products.map((p) => p.imageUrl).filter((u): u is string => !!u))]
  const broken = new Set<string>()
  let unknown = 0
  let next = 0
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < urls.length) {
        const url = urls[next++]
        const ok = await imageOk(url)
        if (ok === false) broken.add(url)
        else if (ok === null) unknown++
      }
    }),
  )
  return { checked: urls.length, broken, unknown }
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
const fresh = (p: Product) => (p.priceCheckedAt ? Date.parse(p.priceCheckedAt) : 0)
/** Il migliore tra due doppioni */
const better = (a: Product, b: Product) => {
  const avail = (p: Product) => (p.availability === 'out_of_stock' ? 0 : 1)
  if (avail(a) !== avail(b)) return avail(a) > avail(b) ? a : b
  if ((a.price !== undefined) !== (b.price !== undefined)) return a.price !== undefined ? a : b
  if (fresh(a) !== fresh(b)) return fresh(a) > fresh(b) ? a : b
  return Date.parse(a.addedAt) <= Date.parse(b.addedAt) ? a : b
}

/** Toglie la taglia dal titolo e la aggiunge alle taglie del prodotto. Ritorna quante ne ha trovate. */
function readSizes(products: Product[]) {
  let n = 0
  for (const p of products) {
    if (p.store !== 'amazon') continue
    const split = splitSize(p.title, p.category)
    if (!split) continue
    p.title = split.base
    p.sizes = sortSizes([...(p.sizes ?? []), split.size])
    n++
  }
  return n
}

function dedupe(products: Product[]) {
  const keep = new Map<string, Product>()
  const keyOf = new Map<Product, string[]>()
  // Due chiavi per prodotto: la foto e (negozio, marca, titolo). Unione semplice: chi condivide una chiave è un doppione.
  const winner = new Map<string, Product>()
  for (const p of products) {
    const keys = [`t:${p.store}|${norm(p.brand ?? '')}|${norm(p.title)}`]
    if (p.imageUrl) keys.push(`i:${p.imageUrl}`)
    keyOf.set(p, keys)
    for (const k of keys) {
      const w = winner.get(k)
      winner.set(k, w ? better(w, p) : p)
    }
  }
  const removed: Product[] = []
  for (const p of products) {
    if (keyOf.get(p)!.every((k) => winner.get(k) === p)) keep.set(p.id, p)
    else removed.push(p)
  }
  // Le taglie dei doppioni passano al prodotto tenuto (sono varianti di taglia dello stesso articolo).
  for (const p of removed) {
    if (!p.sizes?.length) continue
    const to = keyOf.get(p)!.map((k) => winner.get(k)!).find((w) => keep.has(w.id) && w.category === p.category)
    if (to) to.sizes = sortSizes([...(to.sizes ?? []), ...p.sizes])
  }
  return { kept: products.filter((p) => keep.has(p.id)), removed }
}

const withSize = readSizes(catalog)
const { kept: unique, removed: dups } = dedupe(catalog)
const { checked, broken, unknown } = process.env.CLEAN_SKIP_IMAGES ? { checked: 0, broken: new Set<string>(), unknown: 0 } : await checkImages(unique)
const tooMany = broken.size > checked * MAX_BROKEN_SHARE
if (tooMany) annotate('warning', `Pulizia: ${broken.size} foto rotte su ${checked}, troppe: probabile problema di rete, nessun prodotto tolto per le foto.`)
const final = tooMany ? unique : unique.filter((p) => !p.imageUrl || !broken.has(p.imageUrl))
const noPhoto = unique.length - final.length

writeFileSync(file, JSON.stringify(final, null, 1) + '\n')
annotate(
  'notice',
  `Pulizia: ${dups.length} doppioni e ${noPhoto} prodotti con la foto rotta tolti (${checked} foto controllate, ${unknown} senza risposta). Restano ${final.length} prodotti.`,
)
const sized = final.filter((p) => p.sizes?.length)
annotate('notice', `Taglie: ${withSize} varianti con taglia nel titolo, ${sized.length} prodotti con taglie (${sized.filter((p) => p.sizes!.length > 1).length} con più di una).`)
if (dups.length) console.log('Doppioni tolti:', dups.slice(0, 30).map((p) => `${p.id} ${p.title.slice(0, 50)}`).join(' | '))
if (noPhoto && !tooMany) console.log('Foto rotte:', [...broken].slice(0, 30).join(' '))
