import type { Product } from '../types/product'
import { track } from './analytics'
import { shareCode } from './shareCode'

const SITE = 'https://swipeshopping.app/'

/**
 * Link all'app che apre direttamente quel prodotto (non al negozio: così chi lo riceve scopre l'app).
 * Passa da /s/<codice>/, una paginetta con foto, nome e prezzo per l'anteprima in WhatsApp & co.
 * che poi apre l'app su #/p/<id>.
 */
export const productShareUrl = (p: Product) => `${SITE}s/${encodeURIComponent(shareCode(p.id))}/`

/** Usa il pannello di condivisione del telefono; dove non c'è copia il link. Ritorna 'copied' se ha copiato. */
export async function shareProduct(p: Product): Promise<'shared' | 'copied' | 'cancelled'> {
  const url = productShareUrl(p)
  const text = `Guarda cosa ho trovato su Swipe Shopping: ${p.brand ? `${p.brand} – ` : ''}${p.title}`
  track('share', p)
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Swipe Shopping', text, url })
      return 'shared'
    } catch {
      return 'cancelled'
    }
  }
  await navigator.clipboard?.writeText(`${text}\n${url}`)
  return 'copied'
}

/** Prodotto condiviso nell'indirizzo (#/p/<id>), se presente. */
export function sharedProductId(hash = window.location.hash) {
  const m = hash.match(/^#\/?p\/(.+)$/)
  return m ? decodeURIComponent(m[1]) : null
}

// --- Liste di preferiti condivise: #/lista/<nome>/<id>,<id>,… (gli ASIN Amazon senza "amazon:") ---
const MAX_LIST = 60
const shortId = (id: string) => (id.startsWith('amazon:') ? id.slice(7) : id)
const longId = (s: string) => (s.includes(':') ? s : `amazon:${s}`)

export const listShareUrl = (name: string, products: Product[]) =>
  `${SITE}#/lista/${encodeURIComponent(name)}/${products
    .slice(0, MAX_LIST)
    .map((p) => encodeURIComponent(shortId(p.id)))
    .join(',')}`

/** Condivide una cartella di preferiti: chi apre il link la vede nell'app e può salvarla. */
export async function shareList(name: string, products: Product[]): Promise<'shared' | 'copied' | 'cancelled'> {
  const url = listShareUrl(name, products)
  const text = `La mia lista "${name}" su Swipe Shopping (${Math.min(products.length, MAX_LIST)} prodotti)`
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Swipe Shopping', text, url })
      return 'shared'
    } catch {
      return 'cancelled'
    }
  }
  await navigator.clipboard?.writeText(`${text}\n${url}`)
  return 'copied'
}

/** Lista condivisa nell'indirizzo, se presente. */
export function sharedList(hash = window.location.hash): { name: string; ids: string[] } | null {
  const m = hash.match(/^#\/?lista\/([^/]*)\/(.+)$/)
  if (!m) return null
  try {
    const ids = m[2].split(',').filter(Boolean).slice(0, MAX_LIST).map((s) => longId(decodeURIComponent(s)))
    return { name: decodeURIComponent(m[1]) || 'Lista condivisa', ids }
  } catch {
    return null
  }
}
