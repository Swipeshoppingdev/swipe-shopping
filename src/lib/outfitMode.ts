import { useEffect } from 'react'
import { load, save } from './storage'
import { useHashRoute, type Route } from './useHashRoute'

/**
 * Outfit si comporta come una sezione: aperto Outfit, anche Amici, Profilo e le altre pagine restano "in Outfit"
 * (colore e menu) finché non si torna su Scopri/Preferiti/Filtri di una sezione o se ne sceglie un'altra dal menu.
 * Tenere allineato con lo script in index.html.
 */
const KEY = 'inOutfit'
const SECTION_PAGES: Route[] = ['scopri', 'preferiti', 'filtri']

export function useInOutfit() {
  const { route } = useHashRoute()
  return route === 'outfit' || (!SECTION_PAGES.includes(route) && load<boolean>(KEY, false))
}

/** Da montare una volta (App): ricorda se si è in Outfit e mette il suo colore. */
export function useOutfitMode() {
  const { route } = useHashRoute()
  const inOutfit = useInOutfit()
  useEffect(() => {
    if (route === 'outfit') save(KEY, true)
    else if (SECTION_PAGES.includes(route)) save(KEY, false)
    document.documentElement.classList.toggle('outfit', inOutfit)
  }, [route, inOutfit])
  return inOutfit
}
