import { useEffect } from 'react'
import { load, save } from './storage'
import { useHashRoute, type Route } from './useHashRoute'
import { giftSeason } from '../lib/giftSeason'

/**
 * Outfit e Regali si comportano come sezioni: aperti, anche Amici, Profilo e le altre pagine restano "in Outfit"
 * o "in Regali" (colore e barra in basso) finché non si torna su Scopri/Preferiti/Filtri di una sezione
 * o se ne sceglie un'altra dal menu. Tenere allineato con lo script in index.html.
 */
export type Special = 'outfit' | 'regali'
const KEYS: Record<Special, string> = { outfit: 'inOutfit', regali: 'inGifts' }
const SECTION_PAGES: Route[] = ['scopri', 'preferiti', 'filtri']
/** Pagine con un mazzo di prodotti (Swipe insieme): mai in veste Outfit/Regali, ma senza uscirne per dopo. */
const PRODUCT_PAGES: Route[] = ['insieme']

export function useSpecial(): Special | null {
  const { route } = useHashRoute()
  if (route === 'outfit' || route === 'regali') return route
  if (SECTION_PAGES.includes(route) || PRODUCT_PAGES.includes(route)) return null
  return load<boolean>(KEYS.outfit, false) ? 'outfit' : load<boolean>(KEYS.regali, false) ? 'regali' : null
}

export const useInOutfit = () => useSpecial() === 'outfit'
export const useInGifts = () => useSpecial() === 'regali'

/** Da montare una volta (App): ricorda se si è in Outfit o in Regali e mette il loro colore. */
export function useSpecialMode() {
  const { route } = useHashRoute()
  const special = useSpecial()
  useEffect(() => {
    if (route === 'outfit' || route === 'regali') {
      save(KEYS.outfit, route === 'outfit')
      save(KEYS.regali, route === 'regali')
    } else if (SECTION_PAGES.includes(route)) {
      save(KEYS.outfit, false)
      save(KEYS.regali, false)
    }
    document.documentElement.classList.toggle('outfit', special === 'outfit')
    document.documentElement.classList.toggle('regali', special === 'regali')
    // Durante un evento (Halloween) l'area Regali prende i suoi colori.
    document.documentElement.classList.toggle('halloween', special === 'regali' && giftSeason().id === 'halloween')
  }, [route, special])
  return special
}
