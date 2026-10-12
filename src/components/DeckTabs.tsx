import { useEffect } from 'react'
import { DROP_SIZE, setDropOn } from '../lib/drop'
import { load, save } from '../lib/storage'
import { useApp } from '../state/AppState'

type Mode = 'tutto' | 'offerte' | 'oggi'
const TABS: [Mode, string][] = [
  ['tutto', 'Tutto'],
  ['offerte', 'Offerte'],
  ['oggi', '🔥 Oggi'],
]

/** Scorciatoia sopra il mazzo: è lo stesso interruttore "Solo in offerta" dei filtri. */
export function DeckTabs() {
  const { state, actions, drop } = useApp()
  const f = state.filters
  const mode: Mode = drop.on ? 'oggi' : f.onlyDeals ? 'offerte' : 'tutto'
  const choose = (m: Mode) => {
    setDropOn(m === 'oggi')
    if (m !== 'oggi') actions.setFilters({ ...f, onlyDeals: m === 'offerte' || undefined })
  }
  // Pallino sul "Oggi" finché il drop del giorno di questa sezione non è stato aperto.
  const seenKey = `dropSeen:${state.mode}`
  useEffect(() => {
    if (drop.on) save(seenKey, drop.day)
  }, [drop.on, drop.day, seenKey])
  const fresh = drop.total > 0 && !drop.on && load<string>(seenKey, '') !== drop.day

  return (
    <div className="space-y-2">
      <div
        role="tablist"
        aria-label="Cosa vedere"
        className="mx-auto grid w-full max-w-72 grid-cols-3 rounded-full bg-neutral-100 p-1 text-sm font-semibold"
      >
        {TABS.map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => choose(m)}
            className={`relative rounded-full py-1.5 transition ${mode === m ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'}`}
          >
            {label}
            {m === 'oggi' && fresh && <span className="absolute top-1 right-2 size-2 rounded-full bg-rose-500" aria-label="nuovo" />}
          </button>
        ))}
      </div>
      {drop.on ? (
        <p className="text-center text-xs font-semibold text-neutral-500">
          Drop di oggi · {drop.total - drop.left}/{drop.total || DROP_SIZE} · nuovo ogni mattina alle 8
        </p>
      ) : (
        state.mode === 'gadget' && <BudgetChips />
      )}
    </div>
  )
}

const BUDGETS = [15, 30, 50]

/** Gadget: fasce di prezzo rapide per i regali (tocca di nuovo per toglierla). */
function BudgetChips() {
  const { state, actions } = useApp()
  const f = state.filters
  return (
    <div className="flex justify-center gap-2" aria-label="Budget del regalo">
      {BUDGETS.map((max) => {
        const active = f.priceMax === max && !f.priceMin
        return (
          <button
            key={max}
            type="button"
            aria-pressed={active}
            onClick={() =>
              actions.setFilters({
                ...f,
                priceMin: undefined,
                priceMax: active ? undefined : max,
              })
            }
            className={`h-7 rounded-full px-3 text-xs font-semibold ring-1 transition ${
              active ? 'bg-rose-500 text-[#fff] ring-rose-500' : 'bg-white text-neutral-600 ring-neutral-200'
            }`}
          >
            Fino a {max} €
          </button>
        )
      })}
    </div>
  )
}
