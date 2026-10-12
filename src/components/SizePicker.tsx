import { Check } from 'lucide-react'
import { SIZE_KINDS, sizeKind } from '../lib/sizes'

export const SIZE_HINT =
  "Prima i capi dove la tua taglia è disponibile (controllo Amazon, aggiornato due volte al giorno). Gli altri restano dopo."

/**
 * "La tua taglia": una o più taglie per tipo (abbigliamento, vita dei jeans, scarpe).
 * Non nasconde prodotti: quelli con la taglia confermata vanno per primi e hanno l'etichetta sulla foto.
 */
export function SizePicker({ values, selected, onChange }: { values: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v])
  return (
    <div className="space-y-3">
      {SIZE_KINDS.map(({ kind, label }) => {
        const list = values.filter((v) => sizeKind(v) === kind)
        if (!list.length) return null
        return (
          <div key={kind} className="space-y-2">
            <p className="text-sm text-neutral-600">{label}</p>
            <div className="flex flex-wrap gap-2">
              {list.map((v) => {
                const on = selected.includes(v)
                return (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(v)}
                    className={`inline-flex min-w-11 items-center justify-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition active:scale-95 ${
                      on ? 'chip-in' : 'bg-white text-neutral-700 ring-neutral-200'
                    }`}
                  >
                    {on && <Check className="size-3.5" />}
                    {v}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
