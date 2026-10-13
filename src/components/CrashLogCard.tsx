import { Bug } from 'lucide-react'
import { useState } from 'react'
import { clearCrashLog, crashLog } from '../lib/crashLog'

/** Solo admin: gli ultimi errori dell'app su questo telefono, da copiare e mandare a Claude. */
export function CrashLogCard() {
  const [log, setLog] = useState(crashLog)
  const [copied, setCopied] = useState(false)
  if (log.length === 0) return null
  const text = log.map((e) => `${e.at} [${e.where}] ${e.route}\n${e.message}\n${e.stack ?? ''}\n${e.ua}`).join('\n\n')
  return (
    <section className="space-y-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-amber-300">
      <h2 className="flex items-center gap-2 font-semibold">
        <Bug className="size-5 text-amber-600" /> Errori dell'app ({log.length})
      </h2>
      <p className="line-clamp-3 text-xs break-all text-neutral-600">{log[0].message}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard?.writeText(text).catch(() => {})
            setCopied(true)
          }}
          className="flex-1 rounded-full bg-neutral-900 py-2 text-sm font-semibold text-white active:scale-95"
        >
          {copied ? 'Copiato!' : 'Copia per Claude'}
        </button>
        <button
          type="button"
          onClick={() => {
            clearCrashLog()
            setLog([])
          }}
          className="rounded-full px-4 py-2 text-sm font-medium text-neutral-600 ring-1 ring-neutral-200"
        >
          Svuota
        </button>
      </div>
    </section>
  )
}
