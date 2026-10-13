import { Bell } from 'lucide-react'
import { useState } from 'react'
import { disablePush, enablePush, pushAvailable, pushEnabledHere } from '../lib/push'

/** Notifiche su questo telefono (solo app Android): amici e offerte sui preferiti. */
export function PushToggle({ plain = false }: { plain?: boolean }) {
  const [on, setOn] = useState(pushEnabledHere)
  const [busy, setBusy] = useState(false)
  if (!pushAvailable) return null
  return (
    <label className={`flex items-center justify-between gap-3 ${plain ? '' : 'rounded-2xl bg-white p-4 text-sm shadow-sm ring-1 ring-black/5'}`}>
      <span className="flex items-center gap-2">
        {!plain && <Bell className="size-5 text-rose-500" />}
        <span>
          Notifiche su questo telefono
          <span className="block text-xs text-neutral-500">Dagli amici e quando un preferito è in offerta (al massimo ogni 3 giorni, o ogni giorno per la cartella 💸 Quando scende).</span>
        </span>
      </span>
      <input
        type="checkbox"
        checked={on}
        disabled={busy}
        onChange={async (e) => {
          setBusy(true)
          try {
            if (e.target.checked) setOn(await enablePush())
            else {
              await disablePush()
              setOn(false)
            }
          } finally {
            setBusy(false)
          }
        }}
        className={`size-5 shrink-0 ${plain ? 'accent-neutral-900' : 'accent-rose-500'}`}
      />
    </label>
  )
}
