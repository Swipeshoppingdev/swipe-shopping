import type { CategoryId } from '../config/categories'
import type { StoreId } from '../config/stores'

export type Gender = 'uomo' | 'donna' | 'unisex'
export type Availability = 'in_stock' | 'out_of_stock' | 'unknown'

/**
 * Prodotto del catalogo. Ogni voce reale deve essere verificata a mano
 * (o arrivare da un'API/feed ufficiale): niente ASIN, prezzi o immagini inventati.
 */
export interface Product {
  /** Id univoco nell'app: `${store}:${externalId}` */
  id: string
  store: StoreId
  /** ASIN per Amazon, codice articolo per gli altri negozi */
  externalId: string
  title: string
  brand?: string
  gender: Gender
  category: CategoryId
  /** URL immagine autorizzato (SiteStripe/API per Amazon, feed per gli altri) */
  imageUrl?: string
  /** Prezzo attuale in EUR */
  price?: number
  /** true se `price` è il prezzo più basso tra taglie/varianti ("da 39,90 €") */
  priceFrom?: boolean
  /** Prezzo pieno, se il prodotto è scontato */
  originalPrice?: number
  /** ISO date: quando il prezzo è stato verificato. Senza data il prezzo non viene mostrato. */
  priceCheckedAt?: string
  /** Link affiliato completo (obbligatorio per i negozi non Amazon, es. link Awin) */
  affiliateUrl?: string
  /** Taglie disponibili (vedi src/lib/sizes.ts) */
  sizes?: string[]
  /** ISO date: quando sono state lette tutte le taglie da Amazon (senza: solo quella vista nella ricerca) */
  sizesAt?: string
  colors?: string[]
  availability: Availability
  /** Amazon segnala che ne restano pochi (all'ultimo controllo del prezzo) */
  fewLeft?: boolean
  /** Offerta a tempo su Amazon: etichetta (es. "Offerta a tempo") e quando finisce */
  dealBadge?: string
  dealEndsAt?: string
  /** ISO date: quando il prodotto è entrato in catalogo (ordinamento "novità") */
  addedAt: string
  /**
   * Card "esplora": non è un singolo prodotto ma una ricerca reale sul negozio.
   * Usate solo finché il catalogo verificato è vuoto.
   */
  searchQuery?: string
  /** 'ricerca' = aggiunto in automatico dalla ricerca Amazon; assente = inserito a mano */
  source?: 'ricerca'
}

export type SortOrder = 'mix' | 'novita' | 'prezzo_asc' | 'prezzo_desc'

export interface Filters {
  gender: 'tutti' | 'uomo' | 'donna'
  categories: CategoryId[]
  priceMin?: number
  priceMax?: number
  brands: string[]
  stores: StoreId[]
  sizes: string[]
  colors: string[]
  sort: SortOrder
  /** Solo prodotti scontati */
  onlyDeals?: boolean
}

export const DEFAULT_FILTERS: Filters = {
  gender: 'tutti',
  categories: [],
  brands: [],
  stores: [],
  sizes: [],
  colors: [],
  sort: 'mix',
}
