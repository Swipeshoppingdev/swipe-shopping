// Aggiorna public/catalog.json con foto, prezzi e disponibilità dalla Amazon Creators API.
// Gira su GitHub Actions prima di ogni build: le credenziali restano nei Secrets del repository
// e non finiscono mai nel sito. Uso: `npm run sync:amazon` con le variabili d'ambiente impostate.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { classify, isJunk } from './classify.ts'
import { detectColors } from '../src/config/colors.ts'
import { validateProduct } from '../src/lib/validate.ts'
import { DETAIL_SHARDS, detailShard, type ProductDetails } from '../src/lib/details.ts'
import { OUTFIT_PRIORITY, SEARCH_PLAN, inSeason, normalizeBrand } from './search-plan.ts'
import { hasSizes, sortSizes, splitSize } from '../src/lib/sizes.ts'

const { AMAZON_CREDENTIAL_ID, AMAZON_CREDENTIAL_SECRET, AMAZON_CREDENTIAL_VERSION, AMAZON_TOKEN_URL } = process.env
const PARTNER_TAG = process.env.VITE_AMAZON_TAG || 'mrofferta09-21'
const MARKETPLACE = 'www.amazon.it'
const API_BASE = 'https://creatorsapi.amazon/catalog/v1'
// Endpoint del token per versione delle credenziali (EU = 3.2).
const TOKEN_URLS: Record<string, string> = {
  '3.1': 'https://api.amazon.com/auth/o2/token',
  '3.2': 'https://api.amazon.co.uk/auth/o2/token',
  '3.3': 'https://api.amazon.co.jp/auth/o2/token',
}

if (!AMAZON_CREDENTIAL_ID || !AMAZON_CREDENTIAL_SECRET) {
  console.log('Credenziali Amazon assenti: catalogo lasciato invariato.')
  process.exit(0)
}

const file = new URL('../public/catalog.json', import.meta.url)
const catalog = JSON.parse(readFileSync(file, 'utf8')) as Record<string, any>[]

// Gli errori diventano annotazioni GitHub (visibili nel riepilogo) e non bloccano la pubblicazione.
const annotate = (level: 'error' | 'warning' | 'notice', msg: string) =>
  console.log(`::${level}::${msg.replace(/\r?\n/g, ' ').slice(0, 4000)}`)

async function getToken() {
  const url = AMAZON_TOKEN_URL || TOKEN_URLS[AMAZON_CREDENTIAL_VERSION ?? '3.2'] || TOKEN_URLS['3.2']
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: AMAZON_CREDENTIAL_ID,
      client_secret: AMAZON_CREDENTIAL_SECRET,
      scope: 'creatorsapi::default',
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.access_token) throw new Error(`Token non ottenuto (HTTP ${res.status}): ${JSON.stringify(body)}`)
  return body.access_token as string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
// Amazon concede circa una richiesta al secondo: le distanziamo e ritentiamo se rifiutate.
const MIN_GAP_MS = 1100
let lastCall = 0

// Il token di Amazon scade dopo un'ora e un giro dura di più: alla prima risposta "scaduto" se ne prende uno nuovo.
let renewedToken: string | null = null

async function callApi(op: string, token: string, payload: Record<string, unknown>) {
  for (let attempt = 0; ; attempt++) {
    await sleep(Math.max(0, lastCall + MIN_GAP_MS - Date.now()))
    lastCall = Date.now()
    requests++
    const res = await fetch(`${API_BASE}/${op}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${renewedToken ?? token}`, 'Content-Type': 'application/json', 'x-marketplace': MARKETPLACE },
      body: JSON.stringify({ marketplace: MARKETPLACE, partnerTag: PARTNER_TAG, languagesOfPreference: ['it_IT'], ...payload }),
    })
    const body = await res.json().catch(() => ({}))
    if (res.status === 429 && attempt < 4) {
      await sleep(2000 * 2 ** attempt)
      continue
    }
    if (res.status === 401 && attempt < 2 && /expired/i.test(JSON.stringify(body))) {
      renewedToken = await getToken()
      annotate('notice', 'Token Amazon scaduto: rinnovato.')
      continue
    }
    if (!res.ok) throw new Error(`${op} HTTP ${res.status}: ${JSON.stringify(body)}`)
    return body
  }
}

/**
 * Tetto di richieste per esecuzione: Amazon concede 8640 richieste al giorno e il catalogo si aggiorna due volte,
 * quindi 4200 a giro (8400 al giorno) usa quasi tutto il limite. Più richieste = più pagine di ricerca = più prodotti.
 */
const MAX_REQUESTS = Number(process.env.AMAZON_MAX_REQUESTS ?? 4200)
let requests = 0
/** Richieste riservate alle taglie (getVariations): la ricerca si ferma prima, così ne restano per loro. */
const SIZE_REQUESTS = Math.min(Number(process.env.AMAZON_SIZE_REQUESTS ?? 800), MAX_REQUESTS)
const SEARCH_LIMIT = MAX_REQUESTS - SIZE_REQUESTS

const OFFER_RESOURCES = ['offersV2.listings.price', 'offersV2.listings.availability', 'offersV2.listings.isBuyBoxWinner']

const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN)

interface Offer {
  price: number
  basis: number
  availability: string
  /** Amazon dice che ne restano pochi ("Solo 3 disponibili", tipo IN_STOCK_SCARCE) */
  fewLeft: boolean
}

/** Tipi e messaggi di disponibilità visti in questo giro (nel log, per capire cosa manda Amazon). */
const availabilitySeen = new Map<string, number>()

function readListing(item: any): Offer | null {
  const listings: any[] = item?.offersV2?.listings ?? []
  const listing = listings.find((l) => l?.isBuyBoxWinner) ?? listings[0]
  if (!listing) return null
  const availability = String(listing.availability?.type ?? '').toUpperCase()
  const message = String(listing.availability?.message ?? '')
  const seenKey = `${availability}${message ? ` "${message.replace(/\d+/g, 'N')}"` : ''}`
  availabilitySeen.set(seenKey, (availabilitySeen.get(seenKey) ?? 0) + 1)
  return {
    price: num(listing.price?.money?.amount),
    basis: num(listing.price?.savingBasis?.money?.amount),
    availability,
    fewLeft: availability.includes('SCARCE') || /\bsol[oi]\s+\d+|ultim[ie]\s+(\d+\s+)?(pezz|articol|disponibil)/i.test(message),
  }
}

const isUsable = (o: Offer | null): o is Offer => !!o && !o.availability.includes('OUT') && o.price > 0

/** Per i capi con taglie/colori: la variante disponibile con il prezzo più basso. */
async function bestVariant(token: string, asin: string) {
  let best: (Offer & { image?: string }) | null = null
  for (let page = 1; page <= 3; page++) {
    const body = await callApi('getVariations', token, {
      asin,
      variationCount: 9,
      variationPage: page,
      resources: [...OFFER_RESOURCES, 'images.primary.large'],
    })
    const result = body?.variationsResult
    for (const item of result?.items ?? []) {
      const offer = readListing(item)
      if (!isUsable(offer)) continue
      if (!best || offer.price < best.price) best = { ...offer, image: item?.images?.primary?.large?.url }
    }
    if (page >= (result?.variationSummary?.pageCount ?? 1)) break
  }
  return best
}

const now = new Date().toISOString()
const previousAddedAt = new Map(catalog.map((p) => [p.id, p.addedAt]))

/** Prodotti inseriti a mano: aggiorna foto, prezzi e disponibilità. */
async function refreshCurated(token: string, curated: Record<string, any>[], summary: string[]) {
  for (let i = 0; i < curated.length; i += 10) {
    const batch = curated.slice(i, i + 10)
    const body = await callApi('getItems', token, {
      itemIds: batch.map((p) => p.externalId),
      itemIdType: 'ASIN',
      resources: ['images.primary.large', 'itemInfo.title', 'itemInfo.byLineInfo', 'parentASIN', ...OFFER_RESOURCES],
    })
    const errors: any[] = body?.errors ?? []
    for (const err of errors) annotate('warning', `Amazon: ${err.code} ${err.message}`)
    const items: any[] = body?.itemsResult?.items ?? []

    for (const p of batch) {
      const item = items.find((it) => it?.asin === p.externalId)
      if (!item) {
        // Amazon segnala l'ASIN come non accessibile o non valido: lo togliamo dallo swipe.
        if (errors.some((e) => String(e?.message).includes(p.externalId))) p.availability = 'out_of_stock'
        continue
      }
      const image = item?.images?.primary?.large?.url
      if (typeof image === 'string' && image.startsWith('https://')) p.imageUrl = image

      let offer = readListing(item)
      delete p.priceFrom
      if (!isUsable(offer)) {
        // L'ASIN principale non ha un'offerta: proviamo con taglie e colori.
        try {
          const v = await bestVariant(token, item.parentASIN ?? p.externalId)
          if (v) {
            offer = v
            p.priceFrom = true
            if (!p.imageUrl && v.image) p.imageUrl = v.image
          }
        } catch (e) {
          annotate('warning', `Varianti ${p.externalId}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      applyOffer(p, offer)
      summary.push(`${p.externalId}:${p.price ?? '-'}${p.priceFrom ? '(da)' : ''}:${p.availability}`)
    }
  }
}

function applyOffer(p: Record<string, any>, offer: Offer | null) {
  if (isUsable(offer)) {
    p.price = offer.price
    p.priceCheckedAt = now
    if (offer.basis > offer.price) p.originalPrice = offer.basis
    else delete p.originalPrice
    p.availability = 'in_stock'
    if (offer.fewLeft) p.fewLeft = true
    else delete p.fewLeft
  } else {
    delete p.fewLeft
    delete p.price
    delete p.originalPrice
    delete p.priceCheckedAt
    p.availability = offer?.availability.includes('OUT') ? 'out_of_stock' : 'unknown'
  }
}

// Foto aggiuntive e caratteristiche per la scheda prodotto. Se Amazon rifiuta questi campi,
// la ricerca continua senza (meglio un catalogo senza dettagli che nessun catalogo).
let detailResources = ['images.variants.large', 'itemInfo.features']
let reviewResources = ['customerReviews.count', 'customerReviews.starRating']

/** Almeno `minRating` stelle e `minReviews` voti. Senza dati sulle recensioni basta la marca nota. */
function goodReviews(item: any, minRating: number, minReviews: number) {
  const r = item?.customerReviews
  if (!r) return true
  const stars = Number(r?.starRating?.value ?? r?.starRating)
  const count = Number(r?.count)
  return stars >= minRating && count >= minReviews
}
const details = new Map<string, ProductDetails>()

function readDetails(item: any): ProductDetails | null {
  const images = ((item?.images?.variants ?? []) as any[])
    .map((v) => v?.large?.url)
    .filter((u): u is string => typeof u === 'string' && u.startsWith('https://'))
    .slice(0, 6)
  const features = ((item?.itemInfo?.features?.displayValues ?? []) as unknown[])
    .filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
    .map((f) => f.trim().slice(0, 300))
    .slice(0, 6)
  if (!images.length && !features.length) return null
  return { ...(images.length ? { images } : {}), ...(features.length ? { features } : {}) }
}

function writeDetails() {
  const dir = new URL('../public/details/', import.meta.url)
  mkdirSync(dir, { recursive: true })
  // I dettagli degli altri negozi (scritti da sync-stores) restano com'erano.
  const shards: Record<string, ProductDetails>[] = Array.from({ length: DETAIL_SHARDS }, (_, n) => {
    let old: Record<string, ProductDetails> = {}
    try {
      old = JSON.parse(readFileSync(new URL(`${n}.json`, dir), 'utf8'))
    } catch {}
    return Object.fromEntries(Object.entries(old).filter(([id]) => !id.startsWith('amazon:')))
  })
  for (const [id, d] of details) shards[detailShard(id)][id] = d
  shards.forEach((s, n) => writeFileSync(new URL(`${n}.json`, dir), JSON.stringify(s)))
  annotate('notice', `Dettagli: ${details.size} prodotti con foto o caratteristiche.`)
}

/** Cerca su Amazon i prodotti delle marche ammesse, categoria per categoria. */
async function searchCatalog(token: string) {
  const found = new Map<string, Record<string, any>>()
  const pages = Number(process.env.AMAZON_SEARCH_PAGES ?? 2)
  let rejectedBrand = 0
  let rejectedPrice = 0
  let rejectedReviews = 0

  // Una ricerca al giorno (quella del mattino) chiede ad Amazon le ultime novità invece dei più rilevanti:
  // così ogni giorno entrano prodotti nuovi e non sempre gli stessi primi risultati.
  let sortBy = process.env.AMAZON_SORT ?? (new Date().getUTCHours() < 12 ? 'NewestArrivals' : '')

  /** Una pagina di risultati per categoria, genere e marca: ritorna quanti articoli ha restituito Amazon. */
  const searchPage = async (plan: (typeof SEARCH_PLAN)[number], gender: string, brand: string, page: number) => {
          let body: any
          const wantReviews = plan.minRating !== undefined
          try {
            const search = () =>
              callApi('searchItems', token, {
                keywords: gender === 'unisex' ? plan.keywords : `${plan.keywords} ${gender}`,
                brand,
                searchIndex: plan.searchIndex ?? 'Fashion',
                itemCount: 10,
                itemPage: page,
                ...(sortBy ? { sortBy } : {}),
                minPrice: plan.minPrice * 100,
                availability: 'Available',
                resources: [
                  'images.primary.large', 'itemInfo.title', 'itemInfo.byLineInfo', ...detailResources, ...OFFER_RESOURCES,
                  ...(wantReviews ? reviewResources : []),
                ],
              })
            // Se Amazon rifiuta le risorse facoltative (HTTP 400) le togliamo una alla volta e riproviamo.
            for (;;) {
              try {
                body = await search()
                break
              } catch (e) {
                if (!/HTTP 400/.test(String(e))) throw e
                if (sortBy) {
                  annotate('warning', `Ordinamento ${sortBy} non accettato, continuo senza: ${e instanceof Error ? e.message : String(e)}`)
                  sortBy = ''
                } else if (wantReviews && reviewResources.length) {
                  annotate('warning', `Recensioni non disponibili, continuo senza: ${e instanceof Error ? e.message : String(e)}`)
                  reviewResources = []
                } else if (detailResources.length) {
                  annotate('warning', `Dettagli prodotto non disponibili, continuo senza: ${e instanceof Error ? e.message : String(e)}`)
                  detailResources = []
                } else throw e
              }
            }
          } catch (e) {
            annotate('warning', `Ricerca ${plan.category}/${gender}/${brand}: ${e instanceof Error ? e.message : String(e)}`)
            return 0
          }
          const items: any[] = body?.searchResult?.items ?? []
          for (const item of items) {
            const asin = item?.asin
            const title = String(item?.itemInfo?.title?.displayValue ?? '').trim()
            const itemBrand = item?.itemInfo?.byLineInfo?.brand?.displayValue ?? ''
            const image = item?.images?.primary?.large?.url
            const offer = readListing(item)
            if (!asin || title.length < 3 || typeof image !== 'string' || !image.startsWith('https://')) continue
            // Solo la marca cercata: Amazon a volte restituisce marche simili o sconosciute.
            if (!normalizeBrand(itemBrand).includes(normalizeBrand(brand))) {
              rejectedBrand++
              continue
            }
            if (!isUsable(offer) || offer.price < plan.minPrice || offer.price > 3000) {
              rejectedPrice++
              continue
            }
            // Gadget: niente articoli con poche recensioni o voti bassi (quando Amazon le fornisce).
            if (wantReviews && reviewResources.length && !goodReviews(item, plan.minRating!, plan.minReviews ?? 0)) {
              rejectedReviews++
              continue
            }
            const category = classify(title, plan.category)
            // Accessori, ricariche e ricambi al posto del prodotto vero (cover, cinturini, FC Points…).
            if (isJunk(title, category)) {
              rejectedBrand++
              continue
            }
            const id = `amazon:${asin}`
            const existing = found.get(id)
            if (existing) {
              // Lo stesso articolo trovato per uomo e per donna è unisex.
              if (existing.gender !== gender) existing.gender = 'unisex'
              continue
            }
            const p: Record<string, any> = {
              id,
              store: 'amazon',
              externalId: asin,
              title,
              brand,
              gender,
              category,
              imageUrl: image,
              availability: 'in_stock',
              addedAt: previousAddedAt.get(id) ?? now,
              source: 'ricerca',
            }
            // Il colore ha senso per i capi, non per i profumi ("Black Opium" non è nero).
            const colors = plan.searchIndex ? [] : detectColors(title)
            if (colors.length) p.colors = colors
            applyOffer(p, offer)
            found.set(id, p)
            const d = readDetails(item)
            if (d) details.set(id, d)
          }
          return items.length
  }

  // Prime pagine di tutte le ricerche; quelle con altri risultati si segnano per andare più a fondo.
  const deeper: [(typeof SEARCH_PLAN)[number], string, string][] = []
  let stopped = false
  outer: for (const plan of SEARCH_PLAN.filter((pl) => inSeason(pl))) {
    for (const gender of plan.genders) {
      for (const brand of plan.brands) {
        for (let page = 1; page <= pages; page++) {
          if (requests >= SEARCH_LIMIT) {
            annotate('warning', `Raggiunto il tetto di ${SEARCH_LIMIT} richieste: ricerca interrotta a ${plan.category}.`)
            stopped = true
            break outer
          }
          const n = await searchPage(plan, gender, brand, page)
          if (n < 10) break
          if (page === pages) deeper.push([plan, gender, brand])
        }
      }
    }
  }
  // Con le richieste avanzate: pagine 3 e 4, ogni giro da un punto diverso, così in pochi giorni si passa tutto.
  if (!stopped && deeper.length) {
    const before = found.size
    const start = (Math.floor(Date.now() / (12 * 3_600_000)) * 97) % deeper.length
    // Prima sempre le categorie che servono agli outfit, poi le altre a rotazione.
    const rotated = deeper.map((_, i) => deeper[(start + i) % deeper.length])
    const ordered = [...rotated.filter(([p]) => OUTFIT_PRIORITY.has(p.category)), ...rotated.filter(([p]) => !OUTFIT_PRIORITY.has(p.category))]
    let done = 0
    for (let i = 0; i < ordered.length && requests < SEARCH_LIMIT; i++) {
      const [plan, gender, brand] = ordered[i]
      for (let page = pages + 1; page <= pages + 2 && requests < SEARCH_LIMIT; page++) {
        if ((await searchPage(plan, gender, brand, page)) < 10) break
      }
      done++
    }
    annotate('notice', `Pagine in più: ${done}/${deeper.length} ricerche, ${found.size - before} prodotti in più.`)
  }
  annotate('notice', `Ricerca: ${found.size} prodotti trovati, ${rejectedBrand} scartati per marca, ${rejectedPrice} per prezzo/disponibilità, ${rejectedReviews} per recensioni.`)
  return [...found.values()]
}

/** Taglia di Amazon ("39.5 EU", "M", "W32 L34") nel formato dei filtri, o null. */
const sizeOf = (value: string, category: string) => splitSize(`Taglia del prodotto, ${value}`, category)?.size ?? null
const SIZES_MAX_AGE = 10 * 24 * 3_600_000

/**
 * Tutte le taglie disponibili dei capi e delle scarpe (getVariations): la ricerca dà una sola variante per taglia,
 * qui si legge la famiglia intera e si tengono le taglie disponibili dello stesso colore. Prima i prodotti mai
 * controllati, poi i controlli più vecchi; una famiglia letta vale per tutti i suoi prodotti in catalogo.
 */
async function refreshSizes(token: string, products: Record<string, any>[]) {
  const byAsin = new Map(products.filter((p) => p.store === 'amazon').map((p) => [p.externalId as string, p]))
  const candidates = products
    .filter((p) => p.store === 'amazon' && hasSizes(p.category) && p.availability !== 'out_of_stock')
    .sort((a, b) => (a.sizesAt ? Date.parse(a.sizesAt) : 0) - (b.sizesAt ? Date.parse(b.sizesAt) : 0))
  const done = new Set<string>()
  let families = 0
  let updated = 0
  for (const p of candidates) {
    if (requests >= MAX_REQUESTS) break
    if (done.has(p.externalId)) continue
    if (p.sizesAt && Date.now() - Date.parse(p.sizesAt) < 20 * 3_600_000) break // tutti già controllati da poco
    const variants: { asin: string; color: string; size: string | null; ok: boolean }[] = []
    try {
      for (let page = 1; page <= 3 && requests < MAX_REQUESTS; page++) {
        const body = await callApi('getVariations', token, {
          asin: p.externalId,
          variationCount: 10,
          variationPage: page,
          resources: ['offersV2.listings.availability', 'offersV2.listings.price'],
        })
        const result = body?.variationsResult
        for (const item of result?.items ?? []) {
          const attrs: { name?: string; value?: string }[] = item?.variationAttributes ?? []
          const size = attrs.find((a) => a.name === 'size_name')?.value
          const color = attrs.find((a) => a.name === 'color_name')?.value ?? ''
          variants.push({ asin: item?.asin, color, size: size ? sizeOf(size, p.category) : null, ok: isUsable(readListing(item)) })
        }
        if (page >= (result?.variationSummary?.pageCount ?? 1)) break
      }
    } catch (e) {
      // Prodotto senza varianti (taglia unica) o non più accessibile (400/404): lo segniamo e andiamo avanti.
      // Altri errori (token, troppe richieste, Amazon giù) non dicono nulla sulle taglie: si riprova al prossimo giro.
      if (/HTTP 40[04]/.test(String(e))) {
        p.sizesAt = now
        done.add(p.externalId)
        continue
      }
      annotate('warning', `Taglie interrotte a ${p.externalId}: ${e instanceof Error ? e.message : String(e)}`)
      break
    }
    families++
    // Le taglie di ogni colore, per tutti i prodotti di questa famiglia che abbiamo in catalogo.
    const colorOf = new Map(variants.map((v) => [v.asin, v.color]))
    const members = [p, ...variants.map((v) => byAsin.get(v.asin)).filter((m): m is Record<string, any> => !!m && m !== p)]
    for (const m of members) {
      done.add(m.externalId)
      const color = colorOf.get(m.externalId)
      const sizes = variants.filter((v) => v.ok && v.size && (color === undefined || v.color === color)).map((v) => v.size!)
      m.sizesAt = now
      if (sizes.length) {
        m.sizes = sortSizes(sizes)
        updated++
      }
    }
  }
  annotate('notice', `Taglie da Amazon: ${families} famiglie lette, ${updated} prodotti con tutte le taglie disponibili.`)
}

if (process.env.AMAZON_SIZES_ONLY) {
  // Prova: solo le taglie sul catalogo attuale, senza ricerca (stampa un esempio, non salva).
  const token = await getToken()
  await refreshSizes(token, catalog)
  const sample = catalog.filter((p) => p.sizesAt && p.sizes?.length).slice(0, 8)
  for (const p of sample) console.log(`${p.externalId} ${p.category}: ${p.sizes.join(' ')}`)
  console.log(`${requests} richieste.`)
  process.exit(0)
}

try {
  const token = await getToken()
  const curated = catalog.filter((p) => p.store === 'amazon' && p.source !== 'ricerca')
  const summary: string[] = []
  await refreshCurated(token, curated, summary)
  annotate('notice', `Prodotti inseriti a mano: ${summary.join(' | ')}`)

  const curatedIds = new Set(curated.map((p) => p.id))
  let searched = (await searchCatalog(token)).filter((p) => !curatedIds.has(p.id))
  if (searched.length === 0) {
    // Ricerca fallita: teniamo i risultati precedenti invece di svuotare il catalogo.
    searched = catalog.filter((p) => p.source === 'ricerca')
    annotate('warning', 'Nessun risultato dalla ricerca: mantengo il catalogo precedente.')
  } else if (details.size > 0) writeDetails()
  // Una voce strana di Amazon non deve bloccare tutto l'aggiornamento: la scartiamo.
  const invalid = searched.filter((p) => validateProduct(p).length > 0)
  if (invalid.length) {
    annotate('warning', `Scartati ${invalid.length} risultati non validi: ${invalid.slice(0, 5).map((p) => `${p.id} (${validateProduct(p).join(', ')})`).join(' | ')}`)
    searched = searched.filter((p) => validateProduct(p).length === 0)
  }
  // Trovati nel giro prima ma non in questo (le ricerche cambiano a ogni giro): restano finché il prezzo ha meno di 20 ore.
  const searchedIds = new Set(searched.map((p) => p.id))
  const keepUntil = Date.now() - 20 * 3_600_000
  const kept = catalog.filter(
    (p) => p.source === 'ricerca' && !searchedIds.has(p.id) && !curatedIds.has(p.id) && p.priceCheckedAt && Date.parse(p.priceCheckedAt) > keepUntil,
  )
  if (kept.length) annotate('notice', `Tenuti dal giro precedente: ${kept.length} prodotti.`)
  const others = catalog.filter((p) => p.store !== 'amazon')
  // Le taglie lette nei giri precedenti restano fino a 10 giorni (si rileggono prima le più vecchie).
  const previous = new Map(catalog.map((p) => [p.id, p]))
  for (const p of searched) {
    const old = previous.get(p.id)
    if (old?.sizesAt && Date.now() - Date.parse(old.sizesAt) < SIZES_MAX_AGE) {
      p.sizesAt = old.sizesAt
      if (old.sizes?.length) p.sizes = old.sizes
    }
  }
  const next = [...curated, ...others, ...searched, ...kept]
  try {
    await refreshSizes(token, next)
  } catch (e) {
    annotate('warning', `Taglie non aggiornate: ${e instanceof Error ? e.message : String(e)}`)
  }
  writeFileSync(file, JSON.stringify(next, null, 1) + '\n')
  annotate('notice', `Catalogo: ${next.length} prodotti (${searched.length} dalla ricerca), ${requests} richieste ad Amazon.`)
  const few = next.filter((p) => p.fewLeft).length
  const kinds = [...availabilitySeen].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k}: ${n}`)
  annotate('notice', `Ultimi pezzi: ${few} prodotti. Disponibilità viste: ${kinds.join(' | ')}`)
} catch (e) {
  annotate('error', `Sincronizzazione Amazon non riuscita: ${e instanceof Error ? e.message : String(e)}`)
}
