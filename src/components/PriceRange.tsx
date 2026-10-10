import { formatPrice } from '../lib/price'

const LIMIT = 500
const STEP = 5

/** Doppio cursore per la fascia di prezzo. Agli estremi il limite si toglie (nessun minimo / nessun massimo). */
export function PriceRange({
  min,
  max,
  onChange,
  limit = LIMIT,
}: {
  min?: number
  max?: number
  /** Fine del cursore (lì il massimo si toglie) */
  limit?: number
  onChange: (min: number | undefined, max: number | undefined) => void
}) {
  const MAX = limit
  const lo = min ?? 0
  const hi = max ?? MAX
  const pct = (v: number) => (v / MAX) * 100
  const thumb =
    'pointer-events-none absolute inset-0 h-8 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-7 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-neutral-900 [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-7 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:ring-2 [&::-moz-range-thumb]:ring-neutral-900'

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm font-semibold">
        <span>{lo === 0 ? 'Nessun minimo' : formatPrice(lo)}</span>
        <span>{hi >= MAX ? 'Nessun massimo' : formatPrice(hi)}</span>
      </div>
      <div className="relative h-8">
        <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-neutral-200" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-neutral-900"
          style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }}
        />
        <input
          type="range"
          aria-label="Prezzo minimo"
          min={0}
          max={MAX}
          step={STEP}
          value={lo}
          onChange={(e) => {
            const v = Math.min(Number(e.target.value), hi - STEP)
            onChange(v <= 0 ? undefined : v, max)
          }}
          className={thumb}
        />
        <input
          type="range"
          aria-label="Prezzo massimo"
          min={0}
          max={MAX}
          step={STEP}
          value={hi}
          onChange={(e) => {
            const v = Math.max(Number(e.target.value), lo + STEP)
            onChange(min, v >= MAX ? undefined : v)
          }}
          className={thumb}
        />
      </div>
    </div>
  )
}
