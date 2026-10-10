import { Flame, Heart, SlidersHorizontal, BadgePercent, User, Users } from 'lucide-react'
import { universeOf } from '../config/categories'
import { useEffect, useState } from 'react'
import { subscribeUnseen } from '../lib/social'
import { routeHref, type Route } from '../lib/useHashRoute'
import { useApp } from '../state/AppState'

const ITEMS = [
  { route: 'scopri', label: 'Scopri', Icon: Flame },
  { route: 'preferiti', label: 'Preferiti', Icon: Heart },
  { route: 'amici', label: 'Amici', Icon: Users },
  { route: 'filtri', label: 'Filtri', Icon: SlidersHorizontal },
  { route: 'profilo', label: 'Profilo', Icon: User },
] as const

export function BottomNav({ current, hash, inOutfit }: { current: Route; hash: string; inOutfit: boolean }) {
  // In Outfit Scopri, Preferiti e Filtri portano agli outfit, agli outfit salvati e ai filtri degli outfit.
  const onOutfit = inOutfit
  const hrefOf = (r: Route) => (!onOutfit ? routeHref(r) : r === 'scopri' ? '#/outfit' : r === 'preferiti' ? '#/outfit/salvati' : r === 'filtri' ? '#/outfit/filtri' : routeHref(r))
  const isActive = (r: Route) =>
    current !== 'outfit' ? current === r : r === 'scopri' ? !/^#\/outfit\/(salvati|filtri)/.test(hash) : hash.startsWith(hrefOf(r))
  const { wishlist, state, unseenDeals } = useApp()
  const [unseenSocial, setUnseenSocial] = useState(0)
  useEffect(() => subscribeUnseen(setUnseenSocial), [])
  const badges: Partial<Record<Route, number>> = {
    preferiti: onOutfit ? 0 : wishlist.filter((w) => universeOf(w.product.category) === state.mode).length,
    amici: unseenSocial,
  }
  return (
    <nav
      aria-label="Navigazione principale"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200/70 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className={`mx-auto grid h-16 max-w-md grid-cols-5`}>
        {ITEMS.map(({ route, label, Icon }) => {
          const active = isActive(route)
          const badge = badges[route]
          return (
            <li key={route}>
              <a
                href={hrefOf(route)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition ${
                  active ? 'text-neutral-900' : 'text-neutral-400'
                }`}
              >
                <Icon className={`size-6 ${active && route === 'preferiti' ? 'fill-rose-500 text-rose-500' : ''}`} />
                {label}
                {route === 'preferiti' && !onOutfit && unseenDeals > 0 ? (
                  <span
                    aria-label={`${unseenDeals} preferiti in offerta`}
                    className="absolute top-2 left-1/2 ml-2 flex h-5 items-center gap-0.5 rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-[#fff]"
                  >
                    <BadgePercent className="size-3" />
                    {unseenDeals}
                  </span>
                ) : !!badge && (
                  <span className="absolute top-2 left-1/2 ml-2 min-w-5 rounded-full bg-rose-500 px-1.5 text-center text-[10px] leading-5 font-bold text-[#fff]">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
