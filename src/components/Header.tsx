import { closeBreaks } from '../lib/closeBreaks'
import { Ghost, Cookie, Cpu, Gift, LayoutGrid, Menu, Moon, Music, PawPrint, Shirt, Sofa, Sparkles, Sun, TreePine } from 'lucide-react'
import { giftSeason } from '../lib/giftSeason'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { APP_NAME } from '../config/app'
import { SECTIONS, sectionOf, type Universe } from '../config/categories'
import { load, save } from '../lib/storage'
import { useTheme } from '../lib/theme'
import { SocialLinks } from './SocialLinks'
import { useApp } from '../state/AppState'
import { useSpecial } from '../lib/outfitMode'
import { loadChunk } from '../lib/staleChunk'
import type { MenuEntry, MenuId } from './MenuList'

// Elenco riordinabile (con il trascinamento di framer-motion): scaricato a parte, appena l'app è ferma o al primo tocco sul menu.
const loadMenuList = loadChunk(() => import('./MenuList').then((m) => ({ default: m.MenuList })))
const MenuList = lazy(loadMenuList)

/** Barra in alto: menu delle sezioni (tre linee del colore della sezione) a sinistra, logo al centro, tema chiaro/scuro a destra. */
export function Header() {
  const { theme, toggle } = useTheme()
  const { state } = useApp()
  const special = useSpecial()
  return (
    // Sticky con sfondo pieno: iOS 26 riconosce la barra e usa il suo colore sotto l'ora invece di sfocare il contenuto.
    <header className="app-top sticky top-0 z-20 shrink-0 pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 max-w-md items-center gap-2 px-2 sm:max-w-2xl">
        <SectionMenu />
        <a href={special ? `#/${special}` : '#/scopri'} className="flex min-w-0 flex-1 flex-col items-center leading-none">
          <span className="text-lg font-black tracking-tight">
            {APP_NAME.split(' ')[0]}
            <span className="text-rose-500">{APP_NAME.split(' ').slice(1).join(' ')}</span>
          </span>
          <span className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.25em] text-rose-500">{special === 'outfit' ? 'Outfit' : special === 'regali' ? (giftSeason().id === 'halloween' ? 'Halloween' : 'Regali') : sectionOf(state.mode).label}</span>
        </a>
        <button
          type="button"
          onClick={toggle}
          aria-label={theme === 'dark' ? 'Passa al tema chiaro' : 'Passa al tema scuro'}
          title={theme === 'dark' ? 'Tema chiaro' : 'Tema scuro'}
          className="grid size-10 place-items-center rounded-full text-neutral-700 transition active:scale-90 active:bg-neutral-100"
        >
          {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </button>
      </div>
    </header>
  )
}

const ICONS: Record<Universe, typeof Shirt> = {
  moda: Shirt,
  beauty: Sparkles,
  tech: Cpu,
  casa: Sofa,
  gadget: Gift,
  snack: Cookie,
  animali: PawPrint,
  musica: Music,
}

/** Sezioni nuove: hanno il segno "Nuovo" finché l'utente non le apre. Aggiungere qui le prossime. */
const NEW_SECTIONS: Universe[] = ['beauty', 'casa', 'gadget', 'snack', 'animali', 'musica']

/** Menu delle sezioni: ognuna è come un'app a sé, con filtri e preferiti suoi. */
function SectionMenu() {
  const { state, actions } = useApp()
  const special = useSpecial()
  const onOutfit = special === 'outfit'
  const onGifts = special === 'regali'
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = onOutfit ? { ...sectionOf('moda'), label: 'Outfit' } : onGifts ? { ...sectionOf(state.mode), label: giftSeason().id === 'halloween' ? 'Halloween' : 'Regali' } : sectionOf(state.mode)
  const [visited, setVisited] = useState(() => load<Universe[]>('sectionsVisited', []))
  const [menuSeen, setMenuSeen] = useState(() => load<boolean>('sectionsMenuSeen:4', false))
  const isNew = (u: Universe) => NEW_SECTIONS.includes(u) && !visited.includes(u) && u !== state.mode
  // Il pallino sul pulsante sparisce alla prima apertura del menu; il "Nuovo" nel menu quando si apre la sezione.
  // Outfit è "Nuovo" finché non lo si apre.
  const outfitSeen = onOutfit || load<boolean>('outfitVisited', false)
  useEffect(() => {
    if (onOutfit) save('outfitVisited', true)
  }, [onOutfit])
  const giftsSeen = onGifts || load<boolean>('giftsVisited', false)
  // Halloween ha il suo "Nuovo" (ogni anno), anche per chi ha già aperto Regali.
  const halloweenKey = `halloweenVisited:${new Date().getFullYear()}`
  const halloweenSeen = onGifts || load<boolean>(halloweenKey, false)
  useEffect(() => {
    if (onGifts) {
      save('giftsVisited', true)
      if (giftSeason().id === 'halloween') save(halloweenKey, true)
    }
  }, [onGifts, halloweenKey])
  const dot = (!menuSeen && (NEW_SECTIONS.some(isNew) || !outfitSeen || !giftsSeen)) || (giftSeason().id === 'halloween' && !halloweenSeen)

  // Anche se si arriva alla sezione in altri modi (benvenuto, link condiviso): la sezione aperta non è più nuova.
  useEffect(() => {
    const saved = load<Universe[]>('sectionsVisited', [])
    if (NEW_SECTIONS.includes(state.mode) && !saved.includes(state.mode)) save('sectionsVisited', [...saved, state.mode])
  }, [state.mode])

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  useEffect(() => {
    const t = setTimeout(() => void loadMenuList().catch(() => {}), 3000)
    return () => clearTimeout(t)
  }, [])

  const [order, setOrderState] = useState(loadMenuOrder)
  const setOrder = (next: MenuId[]) => {
    setOrderState(next)
    save('menuOrder', next)
  }

  const entries = {} as Record<MenuId, MenuEntry>
  for (const s of SECTIONS) {
    entries[s.id] = {
      label: s.label,
      hint: s.hint,
      color: s.color,
      Icon: ICONS[s.id],
      isNew: isNew(s.id),
      active: s.id === state.mode && !onOutfit && !onGifts,
      onSelect: () => {
        if (!visited.includes(s.id)) setVisited([...visited, s.id])
        // Da Outfit/Regali: prima si lascia la pagina, poi si cambia sezione (Outfit rimette la Moda finché è aperta).
        if (onOutfit || onGifts) window.location.hash = '#/scopri'
        actions.setMode(s.id)
      },
    }
  }
  entries.outfit = { label: 'Outfit', hint: 'Look completi pronti, dalle scarpe alla giacca', color: '#4f46e5', Icon: LayoutGrid, isNew: !outfitSeen, active: onOutfit, href: '#/outfit' }
  // Regali: mazzo con tutte le sezioni, per chi lo riceve e per budget (Black Friday e Natale).
  const season = giftSeason()
  entries.regali =
    season.id === 'halloween'
      ? { label: 'Halloween', hint: season.hint, color: '#ea580c', Icon: Ghost, isNew: !halloweenSeen, active: onGifts, href: '#/regali' }
      : { label: season.title, hint: 'Regali per tutti, per budget e in offerta', color: '#dc2626', Icon: TreePine, isNew: !giftsSeen, active: onGifts, href: '#/regali' }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onPointerDown={() => void loadMenuList().catch(() => {})}
        onClick={() => {
          if (!open) closeBreaks()
          setOpen(!open)
          if (!menuSeen) {
            setMenuSeen(true)
            save('sectionsMenuSeen:4', true)
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${current.label}: cambia sezione`}
        className="relative grid size-10 place-items-center rounded-full text-rose-500 transition active:scale-90 active:bg-neutral-100"
      >
        {dot && (
          <span className="absolute top-0.5 right-0.5 size-3 rounded-full bg-[#8b5cf6] ring-2 ring-neutral-50" aria-label="Nuove sezioni" />
        )}
        <Menu className="size-7" strokeWidth={2.5} />
      </button>
      {open && (
        <div role="menu" className="absolute top-12 left-0 z-30 max-h-[calc(100dvh-10.5rem-env(safe-area-inset-bottom))] w-72 overflow-y-auto rounded-2xl bg-white p-1.5 shadow-xl ring-1 ring-neutral-200">
          {/* Tenendo premuta una voce la si trascina su o giù (nessun tasto: chi lo sa lo usa, gli altri non lo notano). */}
          <Suspense fallback={<div style={{ height: order.length * 58 }} />}>
            <MenuList order={order} entries={entries} onReorder={setOrder} onPick={() => setOpen(false)} />
          </Suspense>
          <p className="px-2.5 pt-1 pb-0.5 text-center text-[10px] text-neutral-500">Tieni premuto e trascina per riordinare le voci</p>
          <div className="mt-1 border-t border-neutral-100 pt-1">
            <SocialLinks />
          </div>
        </div>
      )}
    </div>
  )
}

/** Ordine di partenza scelto da Kevin (chi lo riordina tiene il suo). */
const DEFAULT_ORDER: MenuId[] = ['moda', 'tech', 'snack', 'outfit', 'regali', 'gadget', 'casa', 'beauty', 'animali', 'musica']

/** Ordine salvato; le voci nuove (aggiunte dopo) entrano nella loro posizione di partenza. */
function loadMenuOrder(): MenuId[] {
  const saved = load<MenuId[]>('menuOrder', []).filter((id) => DEFAULT_ORDER.includes(id))
  const out = [...new Set(saved)]
  DEFAULT_ORDER.forEach((id, i) => {
    if (out.includes(id)) return
    const before = DEFAULT_ORDER.slice(0, i).filter((x) => out.includes(x)).pop()
    out.splice(before ? out.indexOf(before) + 1 : 0, 0, id)
  })
  return out
}
