import { closeBreaks } from '../lib/closeBreaks'
import { Check, ChevronDown, Ghost, Cookie, Cpu, Gift, LayoutGrid, Moon, PawPrint, Shirt, Sofa, Sparkles, Sun, TreePine } from 'lucide-react'
import { giftSeason } from '../pages/GiftsPage'
import { Reorder, useDragControls } from 'framer-motion'
import { useEffect, useRef, useState, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent } from 'react'
import { APP_NAME } from '../config/app'
import { SECTIONS, sectionOf, type Universe } from '../config/categories'
import { load, save } from '../lib/storage'
import { useTheme } from '../lib/theme'
import { SocialLinks } from './SocialLinks'
import { useApp } from '../state/AppState'
import { useSpecial } from '../lib/outfitMode'

/** Barra in alto: menu delle sezioni a sinistra, logo al centro, tema chiaro/scuro a destra. */
export function Header() {
  const { theme, toggle } = useTheme()
  const { state } = useApp()
  const special = useSpecial()
  return (
    // Sticky con sfondo pieno: iOS 26 riconosce la barra e usa il suo colore sotto l'ora invece di sfocare il contenuto.
    <header className="sticky top-0 z-20 shrink-0 bg-neutral-50 pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 max-w-md items-center gap-2 px-2 sm:max-w-2xl">
        <SectionMenu />
        <a href={special ? `#/${special}` : '#/scopri'} className="flex min-w-0 flex-1 flex-col items-center leading-none">
          <span className="text-lg font-black tracking-tight">
            {APP_NAME.split(' ')[0]}
            <span className="text-rose-500">{APP_NAME.split(' ').slice(1).join(' ')}</span>
          </span>
          <span className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.25em] text-rose-500">{special === 'outfit' ? 'Outfit' : special === 'regali' ? (giftSeason().id === 'halloween' ? 'Halloween' : 'Regali') : sectionOf(state.mode).label}</span>
        </a>
        {/* Spazio vuoto a destra per tenere il logo centrato (Outfit si apre dal menu Sezioni, scelta di Kevin). */}
        <span className="w-18 max-[389px]:w-9" aria-hidden />
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
}

/** Sezioni nuove: hanno il segno "Nuovo" finché l'utente non le apre. Aggiungere qui le prossime. */
const NEW_SECTIONS: Universe[] = ['beauty', 'casa', 'gadget', 'snack', 'animali']

/** Menu delle sezioni: ognuna è come un'app a sé, con filtri e preferiti suoi. */
function SectionMenu() {
  const { state, actions } = useApp()
  const special = useSpecial()
  const onOutfit = special === 'outfit'
  const onGifts = special === 'regali'
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = onOutfit ? { ...sectionOf('moda'), label: 'Outfit' } : onGifts ? { ...sectionOf(state.mode), label: giftSeason().id === 'halloween' ? 'Halloween' : 'Regali' } : sectionOf(state.mode)
  const Icon = onOutfit ? LayoutGrid : onGifts ? (giftSeason().id === 'halloween' ? Ghost : TreePine) : ICONS[current.id]
  const [visited, setVisited] = useState(() => load<Universe[]>('sectionsVisited', []))
  const [menuSeen, setMenuSeen] = useState(() => load<boolean>('sectionsMenuSeen:3', false))
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
        onClick={() => {
          if (!open) closeBreaks()
          setOpen(!open)
          if (!menuSeen) {
            setMenuSeen(true)
            save('sectionsMenuSeen:3', true)
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${current.label}: cambia sezione`}
        className="relative flex h-10 w-28 items-center justify-center gap-1.5 rounded-full border-[1.5px] border-rose-500 bg-transparent text-rose-500 active:scale-95"
      >
        {dot && (
          <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-[#8b5cf6] ring-2 ring-neutral-50" aria-label="Nuove sezioni" />
        )}
        <Icon className="size-4 shrink-0" />
        <span className="flex flex-col items-start leading-none">
          <span className="text-[9px] font-semibold uppercase tracking-wide opacity-80">Sezioni</span>
          <span className="text-sm font-bold">{current.label}</span>
        </span>
        <ChevronDown className={`size-3.5 shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="menu" className="absolute top-12 left-0 z-30 max-h-[calc(100dvh-10.5rem-env(safe-area-inset-bottom))] w-72 overflow-y-auto rounded-2xl bg-white p-1.5 shadow-xl ring-1 ring-neutral-200">
          {/* Tenendo premuta una voce la si trascina su o giù (nessun tasto: chi lo sa lo usa, gli altri non lo notano). */}
          <Reorder.Group as="div" axis="y" values={order} onReorder={setOrder}>
            {order.map((id) => (
              <MenuItem key={id} id={id} entry={entries[id]} onPick={() => setOpen(false)} />
            ))}
          </Reorder.Group>
          <p className="px-2.5 pt-1 pb-0.5 text-center text-[10px] text-neutral-500">Tieni premuto e trascina per riordinare le voci</p>
          <div className="mt-1 border-t border-neutral-100 pt-1">
            <SocialLinks />
          </div>
        </div>
      )}
    </div>
  )
}

/** Voci del menu: le sezioni più Outfit e Regali. Ognuno può riordinarle (salvato sul telefono). */
type MenuId = Universe | 'outfit' | 'regali'
type MenuEntry = { label: string; hint: string; color: string; Icon: typeof Shirt; isNew: boolean; active: boolean; href?: string; onSelect?: () => void }

/** Ordine di partenza scelto da Kevin (chi lo riordina tiene il suo). */
const DEFAULT_ORDER: MenuId[] = ['moda', 'tech', 'snack', 'outfit', 'regali', 'gadget', 'casa', 'beauty', 'animali']

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

/** Una voce del menu: tocco = apre, pressione lunga = si trascina. */
function MenuItem({ id, entry: e, onPick }: { id: MenuId; entry: MenuEntry; onPick: () => void }) {
  const controls = useDragControls()
  const [dragging, setDragging] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const start = useRef<{ x: number; y: number } | null>(null)
  const moved = useRef(false)

  const cancel = () => {
    clearTimeout(timer.current)
    start.current = null
  }
  const onPointerDown = (ev: RPointerEvent<HTMLElement>) => {
    moved.current = false
    start.current = { x: ev.clientX, y: ev.clientY }
    const native = ev.nativeEvent
    timer.current = setTimeout(() => {
      moved.current = true
      setDragging(true)
      navigator.vibrate?.(15)
      // Durante il trascinamento il menu non deve scorrere (iOS).
      const block = (t: TouchEvent) => t.preventDefault()
      const stop = () => {
        document.removeEventListener('touchmove', block)
        document.removeEventListener('pointerup', stop)
        document.removeEventListener('pointercancel', stop)
        setDragging(false)
      }
      document.addEventListener('touchmove', block, { passive: false })
      document.addEventListener('pointerup', stop)
      document.addEventListener('pointercancel', stop)
      controls.start(native)
    }, LONG_PRESS_MS)
  }
  const onPointerMove = (ev: RPointerEvent<HTMLElement>) => {
    // Se il dito si muove prima del tempo è uno scorrimento, non una pressione lunga.
    if (start.current && Math.hypot(ev.clientX - start.current.x, ev.clientY - start.current.y) > 8) cancel()
  }
  const onClick = (ev: RMouseEvent) => {
    if (moved.current) {
      ev.preventDefault()
      moved.current = false
      return
    }
    e.onSelect?.()
    onPick()
  }

  const inner = (
    <>
      {/* Colori fissi: ogni voce mostra il suo colore, qualunque sia la sezione aperta. */}
      <span className="grid size-9 shrink-0 place-items-center rounded-full text-[#fff]" style={{ background: e.color }}>
        <e.Icon className="size-4.5" />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="flex items-center gap-1.5 font-semibold">
          {e.label}
          {e.isNew && (
            <span className="rounded-full px-1.5 py-px text-[10px] font-bold uppercase text-[#fff]" style={{ background: e.color }}>
              Nuovo
            </span>
          )}
        </span>
        <span className="block truncate text-xs text-neutral-500">{e.hint}</span>
      </span>
      {e.active && <Check className="size-4 shrink-0" style={{ color: e.color }} />}
    </>
  )
  const cls = `flex w-full items-center gap-3 rounded-xl p-2.5 text-left select-none [-webkit-touch-callout:none] active:bg-neutral-100 ${
    dragging ? 'bg-white shadow-lg ring-1 ring-neutral-200' : e.active ? 'bg-neutral-100' : ''
  }`
  const handlers = { onPointerDown, onPointerMove, onPointerUp: cancel, onPointerCancel: cancel, onContextMenu: (ev: RMouseEvent) => ev.preventDefault(), onClick }
  return (
    <Reorder.Item
      as="div"
      value={id}
      dragListener={false}
      dragControls={controls}
      animate={{ scale: dragging ? 1.03 : 1 }}
      className="relative"
      style={{ zIndex: dragging ? 1 : 0 }}
    >
      {e.href ? (
        <a href={e.href} role="menuitemradio" aria-checked={e.active} draggable={false} className={cls} {...handlers}>
          {inner}
        </a>
      ) : (
        <button type="button" role="menuitemradio" aria-checked={e.active} className={cls} {...handlers}>
          {inner}
        </button>
      )}
    </Reorder.Item>
  )
}

const LONG_PRESS_MS = 400
