import { RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useApp } from '../state/AppState'

/** Tasto "annulla" sotto il mazzo: l'ultimo swipe, gli ultimi 10 "no" o tutti i "no" della sezione. */
export function UndoMenu() {
  const { state, sectionDisliked, actions } = useApp()
  return (
    <UndoMenuView
      canUndo={state.history.length > 0}
      nos={sectionDisliked.length}
      onUndo={actions.undo}
      onRestore={(last) => actions.restore(last ? sectionDisliked.slice(-last) : sectionDisliked)}
    />
  )
}

/** Il menu "annulla": usato dal mazzo dei prodotti e da quello degli outfit. */
export function UndoMenuView({ canUndo, nos, onUndo, onRestore }: { canUndo: boolean; nos: number; onUndo: () => void; onRestore: (last?: number) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const pick = (fn: () => void) => {
    fn()
    setOpen(false)
  }
  const item = 'block w-full px-4 py-3 text-left text-sm font-medium active:bg-neutral-100 disabled:opacity-40'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={!canUndo && nos === 0}
        aria-label="Annulla"
        aria-expanded={open}
        title="Annulla"
        className="grid size-11 place-items-center rounded-full bg-white text-neutral-500 shadow-md ring-1 ring-black/5 transition active:scale-90 disabled:opacity-30"
      >
        <RotateCcw className="size-5" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-30 mb-2 w-60 overflow-hidden rounded-2xl bg-white text-neutral-900 shadow-xl ring-1 ring-black/10"
        >
          <button type="button" role="menuitem" disabled={!canUndo} onClick={() => pick(onUndo)} className={item}>
            Annulla l'ultimo
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={nos === 0}
            onClick={() => pick(() => onRestore(10))}
            className={`${item} border-t border-neutral-100`}
          >
            Rivedi gli ultimi {Math.min(10, nos) || 10} "no"
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={nos === 0}
            onClick={() => pick(() => onRestore())}
            className={`${item} border-t border-neutral-100`}
          >
            Rivedi tutti i "no"{nos > 0 ? ` (${nos.toLocaleString('it-IT')})` : ''}
          </button>
        </div>
      )}
    </div>
  )
}
