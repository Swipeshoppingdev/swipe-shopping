import { Flag } from 'lucide-react'
import { useState } from 'react'
import { REPORT_REASONS, alreadyReported, reportProduct } from '../lib/reports'
import { useApp } from '../state/AppState'
import type { Product } from '../types/product'

/** "Segnala un problema" nella scheda prodotto: si sceglie un motivo e il prodotto esce dal mazzo. */
export function ReportProduct({ product }: { product: Product }) {
  const { wishlist, state, actions } = useApp()
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(() => alreadyReported(product.id))

  if (done) return <p className="text-center text-xs text-neutral-500">Grazie per la segnalazione: lo controlliamo.</p>
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mx-auto flex items-center gap-1.5 text-xs font-medium text-neutral-500 underline">
        <Flag className="size-3.5" /> Segnala un problema
      </button>
    )
  }
  return (
    <div className="rounded-2xl bg-white p-3 ring-1 ring-neutral-200">
      <p className="mb-2 text-sm font-semibold">Cosa non va?</p>
      <div className="flex flex-col gap-1.5">
        {REPORT_REASONS.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => {
              void reportProduct(product.id, r.id)
              setDone(true)
              // Non lo rivedi più nel mazzo (resta tra i preferiti se l'avevi salvato).
              const saved = wishlist.some((w) => w.product.id === product.id)
              if (!saved && !state.disliked.includes(product.id)) actions.dislike(product)
            }}
            className="rounded-xl bg-neutral-100 px-3 py-2.5 text-left text-sm font-medium active:scale-[0.98]"
          >
            {r.label}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => setOpen(false)} className="mt-2 w-full text-center text-xs text-neutral-500 underline">
        Annulla
      </button>
    </div>
  )
}
