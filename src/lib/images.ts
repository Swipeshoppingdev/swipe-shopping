/**
 * Foto dei prodotti con rete lenta: foto più leggere, scaricate una alla volta in ordine di mazzo e riprovate se
 * la rete le perde. Così la carta in cima non resta bianca mentre le foto delle carte lontane si contendono la linea.
 */

type Conn = { effectiveType?: string; saveData?: boolean; addEventListener?: (t: string, f: () => void) => void }
const conn = (): Conn | undefined => (navigator as Navigator & { connection?: Conn }).connection

/** Ultimi tempi di download delle foto (ms): su iPhone non c'è navigator.connection, si capisce da qui. */
const times: number[] = []
let measuredSlow = false

let firstShown: () => void
/** Si risolve quando la prima foto di un prodotto è arrivata (per far partire dopo i download grossi). */
export const firstImage = new Promise<void>((r) => (firstShown = r))

/** Una foto è arrivata in `ms` (da quando è stata chiesta). */
export function noteImageTime(ms: number) {
  firstShown()
  times.push(ms)
  if (times.length > 6) times.shift()
  if (times.length >= 3) {
    const avg = times.reduce((a, b) => a + b, 0) / times.length
    // Isteresi: lenta sopra 1,8 s di media, di nuovo veloce sotto 0,7 s.
    measuredSlow = measuredSlow ? avg > 700 : avg > 1800
  }
}

export function slowNetwork() {
  const c = conn()
  if (c?.saveData) return true
  if (c?.effectiveType && /(^|-)(2g|3g)$/.test(c.effectiveType)) return true
  return measuredSlow
}

/**
 * Foto Amazon più piccola con rete lenta (320 px invece di 500: meno della metà dei dati).
 * Le foto degli altri negozi restano come sono.
 */
export function sizedImage(url: string | null | undefined, slow = slowNetwork()): string | undefined {
  if (!url) return undefined
  if (!slow || !url.includes('m.media-amazon.com')) return url
  return url.replace(/\._(AC_)?SL\d{3,4}_\./, '._$1SL320_.')
}

/** Foto scaricate in anticipo, tenute vive (e decodificate) finché servono. */
const kept = new Map<string, HTMLImageElement>()
let queue: string[] = []
let running = 0

function pump() {
  const max = slowNetwork() ? 1 : 3
  while (running < max && queue.length) {
    const url = queue.shift()!
    if (kept.has(url)) continue
    running++
    const img = new Image()
    img.decoding = 'async'
    const start = performance.now()
    let tries = 0
    const done = () => {
      running--
      pump()
    }
    img.onload = () => {
      noteImageTime(performance.now() - start)
      img.decode?.().catch(() => {})
      done()
    }
    img.onerror = () => {
      // Rete persa a metà: si riprova una volta, poi si lascia stare (la carta riproverà da sé).
      if (tries++ < 1) setTimeout(() => (img.src = url), 1500)
      else {
        kept.delete(url)
        done()
      }
    }
    img.src = url
    kept.set(url, img)
    if (kept.size > 40) kept.delete(kept.keys().next().value!)
  }
}

/**
 * Prossime foto del mazzo, in ordine: la coda precedente viene sostituita, così dopo uno swipe
 * si scarica prima la carta che arriva e non quelle che erano in coda da prima.
 */
export function preloadImages(urls: (string | null | undefined)[]) {
  queue = urls.map((u) => sizedImage(u)).filter((u): u is string => !!u && !kept.has(u))
  pump()
}

/** Quante carte avanti conviene scaricare: con rete lenta meno, per lasciare la linea alla prossima. */
export const aheadCount = () => (slowNetwork() ? 4 : 8)

/** Foto scaricate in anticipo con priorità bassa, fuori dalla coda del mazzo (es. prime carte delle altre sezioni). */
const warming = new Set<HTMLImageElement>()
export function warmImages(urls: (string | null | undefined)[]) {
  if (slowNetwork()) return
  for (const url of urls) {
    const src = sizedImage(url)
    if (!src || kept.has(src)) continue
    const img = new Image()
    img.fetchPriority = 'low'
    img.decoding = 'async'
    const done = () => warming.delete(img)
    img.onload = img.onerror = done
    img.src = src
    warming.add(img)
  }
}
