import { idFromShareCode, shareCode } from './shareCode.ts'

/**
 * Link condiviso di un outfit: /o/<stile>/<capo>.<capo>.../ (codici come nei link dei prodotti).
 * La paginetta dà l'anteprima e apre l'app su #/outfit/v/<stile>/<capi>, dove si vede e si può salvare.
 */
export const outfitCodes = (ids: string[]) => ids.map((id) => encodeURIComponent(shareCode(id))).join('.')
export const outfitSharePath = (style: string, ids: string[]) => `/o/${style}/${outfitCodes(ids)}/`
export const outfitAppHash = (style: string, ids: string[]) => `#/outfit/v/${style}/${outfitCodes(ids)}`

/** Outfit condiviso nell'indirizzo dell'app, se presente. */
export function sharedOutfit(hash: string): { style: string; ids: string[] } | null {
  const m = hash.match(/^#\/outfit\/v\/([a-z]+)\/([^/?]+)/)
  if (!m) return null
  try {
    const ids = m[2].split('.').filter(Boolean).slice(0, 8).map((c) => idFromShareCode(decodeURIComponent(c)))
    return ids.length ? { style: m[1], ids } : null
  } catch {
    return null
  }
}
