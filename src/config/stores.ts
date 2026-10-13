import type { Product } from '../types/product'

export const AMAZON_TAG: string = import.meta.env?.VITE_AMAZON_TAG || 'mrofferta09-21'

export interface StoreConfig {
  id: string
  name: string
  /** Negozio attivo nell'app (serve un programma di affiliazione approvato) */
  enabled: boolean
  /** Ore dopo cui un prezzo inserito a mano non viene più mostrato */
  priceMaxAgeHours: number
  /** Costruisce il link affiliato. Restituisce null se il prodotto non ha un link valido. */
  buildUrl: (p: Product) => string | null
  /** Immagine ufficiale ricavata dal codice prodotto, usata se manca `imageUrl` */
  buildImageUrl?: (p: Product) => string | null
}

const fromAffiliateUrl = (p: Product) => (p.affiliateUrl?.startsWith('https://') ? p.affiliateUrl : null)

/**
 * Link affiliati per negozio (es. deep link Awin). Finché un negozio non è qui il link
 * resta quello normale della pagina prodotto, salvato in `affiliateUrl` dalla sincronizzazione.
 */
const AFFILIATE_LINKS: Partial<Record<string, (url: string) => string>> = {}
const affiliate = (store: string, p: Product) => {
  const url = fromAffiliateUrl(p)
  const wrap = AFFILIATE_LINKS[store]
  return url && wrap ? wrap(url) : url
}

export const STORES = {
  amazon: {
    id: 'amazon',
    name: 'Amazon',
    enabled: true,
    // Le regole Amazon Associates non consentono prezzi più vecchi di 24 ore.
    priceMaxAgeHours: 24,
    buildUrl: (p) => {
      if (p.searchQuery) {
        return `https://www.amazon.it/s?k=${encodeURIComponent(p.searchQuery)}&tag=${AMAZON_TAG}`
      }
      return /^[A-Z0-9]{10}$/.test(p.externalId)
        ? `https://www.amazon.it/dp/${p.externalId}?tag=${AMAZON_TAG}`
        : null
    },
  },
  // Negozi letti ogni giorno dal loro sito (scripts/sync-stores.ts). Per ora link normali:
  // con l'affiliazione Awin basterà avvolgere il link in `affiliate` qui sotto.
  benetton: { id: 'benetton', name: 'Benetton', enabled: true, priceMaxAgeHours: 48, buildUrl: (p) => affiliate('benetton', p) },
  calzedonia: { id: 'calzedonia', name: 'Calzedonia', enabled: true, priceMaxAgeHours: 48, buildUrl: (p) => affiliate('calzedonia', p) },
  // Negozi predisposti: si attivano quando c'è un programma di affiliazione
  // approvato (es. tramite Awin) e i prodotti hanno `affiliateUrl`.
  shein: { id: 'shein', name: 'SHEIN', enabled: false, priceMaxAgeHours: 48, buildUrl: fromAffiliateUrl },
  decathlon: { id: 'decathlon', name: 'Decathlon', enabled: false, priceMaxAgeHours: 48, buildUrl: fromAffiliateUrl },
  zalando: { id: 'zalando', name: 'Zalando', enabled: false, priceMaxAgeHours: 72, buildUrl: fromAffiliateUrl },
  asos: { id: 'asos', name: 'ASOS', enabled: false, priceMaxAgeHours: 72, buildUrl: fromAffiliateUrl },
  aboutyou: { id: 'aboutyou', name: 'ABOUT YOU', enabled: false, priceMaxAgeHours: 72, buildUrl: fromAffiliateUrl },
  nike: { id: 'nike', name: 'Nike', enabled: false, priceMaxAgeHours: 72, buildUrl: fromAffiliateUrl },
  adidas: { id: 'adidas', name: 'Adidas', enabled: false, priceMaxAgeHours: 72, buildUrl: fromAffiliateUrl },
} satisfies Record<string, StoreConfig>

export type StoreId = keyof typeof STORES

export const isStoreId = (id: string): id is StoreId => id in STORES
export const storeName = (id: StoreId) => STORES[id].name
/** "Marca · Negozio", o solo il negozio quando coincidono (es. Calzedonia su Calzedonia). */
export const brandAndStore = (p: Product, fallback?: string) => {
  const brand = p.brand ?? fallback
  const store = storeName(p.store)
  return !brand || brand.toLowerCase() === store.toLowerCase() ? store : `${brand} · ${store}`
}
export const productUrl = (p: Product) => STORES[p.store]?.buildUrl(p) ?? null
export const productImageUrl = (p: Product): string | null => {
  if (p.imageUrl) return p.imageUrl
  const store: StoreConfig | undefined = STORES[p.store]
  return store?.buildImageUrl?.(p) ?? null
}
export const storeLinkLabel = (p: Product) =>
  p.searchQuery ? `Cerca su ${storeName(p.store)}` : `Vedi su ${storeName(p.store)}`

/**
 * Un solo link che mette più prodotti Amazon nel carrello (pagina ufficiale "Aggiungi al carrello"
 * di Amazon, con il nostro tag affiliato). Solo prodotti Amazon veri (non le ricerche), al massimo 30.
 */
export function amazonCartUrl(products: Product[]) {
  const all = [...new Set(products.filter((p) => p.store === 'amazon' && !p.searchQuery && p.availability !== 'out_of_stock').map((p) => p.externalId))]
  const asins = all.slice(0, 30)
  if (asins.length < 2) return null
  const q = asins.map((a, i) => `ASIN.${i + 1}=${encodeURIComponent(a)}&Quantity.${i + 1}=1`).join('&')
  return { url: `https://www.amazon.it/gp/aws/cart/add.html?AssociateTag=${AMAZON_TAG}&${q}`, count: asins.length, total: all.length }
}
