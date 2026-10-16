import { Check, type Shirt } from 'lucide-react'
import { Reorder, useDragControls } from 'framer-motion'
import { useRef, useState, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent } from 'react'
import type { Universe } from '../config/categories'

/** Voci del menu: le sezioni più Outfit e Regali. Ognuno può riordinarle (salvato sul telefono). */
export type MenuId = Universe | 'outfit' | 'regali'
export type MenuEntry = { label: string; hint: string; color: string; Icon: typeof Shirt; isNew: boolean; active: boolean; href?: string; onSelect?: () => void }

/** Le voci del menu delle sezioni: tenendone premuta una la si trascina su o giù. */
export function MenuList({ order, entries, onReorder, onPick }: { order: MenuId[]; entries: Record<MenuId, MenuEntry>; onReorder: (next: MenuId[]) => void; onPick: () => void }) {
  return (
    <Reorder.Group as="div" axis="y" values={order} onReorder={onReorder}>
      {order.map((id) => (
        <MenuItem key={id} id={id} entry={entries[id]} onPick={onPick} />
      ))}
    </Reorder.Group>
  )
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
