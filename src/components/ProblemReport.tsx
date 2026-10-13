import { Check, MessageSquareWarning } from 'lucide-react'
import { useState } from 'react'
import { load, save } from '../lib/storage'
import { useApp } from '../state/AppState'

/** Motivi e punti dell'app già pronti: niente testo libero. */
const PROBLEMS = ['È lenta', 'Si blocca o si chiude', 'Foto che non si vedono', 'Prezzi sbagliati', 'Taglie sbagliate', 'Prodotti fuori posto', 'Un pulsante non funziona', 'Non capisco come si usa', 'Altro'] as const
const WHERE = ['Scopri (swipe)', 'Scheda prodotto', 'Preferiti', 'Outfit', 'Regali', 'Amici', 'Giochi', 'Filtri', 'Profilo / account', 'Tutta l’app'] as const
const MAX_PER_DAY = 5

/**
 * "Segnala un problema" in Profilo, per tutti: si sceglie cosa e dove, e arriva anonimo
 * nelle Statistiche dell'admin (stessa tabella degli errori dell'app, schema-16.sql, tipo "segnalazione").
 */
export function ProblemReport() {
  const { state } = useApp()
  const [problem, setProblem] = useState<string | null>(null)
  const [where, setWhere] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error' | 'limit'>('idle')

  const send = async () => {
    if (!problem || !where) return
    const today = new Date().toISOString().slice(0, 10)
    const sent = load<{ day: string; n: number }>('problemReports', { day: today, n: 0 })
    const n = sent.day === today ? sent.n : 0
    if (n >= MAX_PER_DAY) return setStatus('limit')
    setStatus('sending')
    try {
      const { supabase } = await import('../lib/supabase')
      const native = !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
      const { error } = supabase
        ? await supabase.rpc('report_error', {
            p_at: new Date().toISOString(),
            p_kind: 'segnalazione',
            p_message: `${problem} · ${where}`,
            p_stack: `Sezione: ${state.mode} · versione ${__APP_VERSION__}`,
            p_route: location.hash.slice(0, 120),
            p_ua: navigator.userAgent.slice(0, 200),
            p_native: native,
          })
        : { error: new Error('offline') }
      if (error) return setStatus('error')
      save('problemReports', { day: today, n: n + 1 })
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <div className="space-y-2 text-sm">
        <p className="flex items-center gap-2 font-medium text-emerald-700">
          <Check className="size-4" /> Grazie! Ci arriva subito e lo sistemiamo.
        </p>
        <button
          type="button"
          onClick={() => {
            setProblem(null)
            setWhere(null)
            setStatus('idle')
          }}
          className="text-xs text-neutral-500 underline"
        >
          Segnala un altro problema
        </button>
      </div>
    )
  }

  const chip = (label: string, on: boolean, pick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={pick}
      aria-pressed={on}
      className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 active:scale-95 ${
        on ? 'bg-neutral-900 text-white ring-neutral-900' : 'bg-white text-neutral-700 ring-neutral-200'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-neutral-500">Qualcosa non va? Scegli cosa e dove: ci arriva in forma anonima.</p>
      <div>
        <p className="mb-1.5 font-medium">Cosa succede?</p>
        <div className="flex flex-wrap gap-1.5">{PROBLEMS.map((p) => chip(p, problem === p, () => setProblem(problem === p ? null : p)))}</div>
      </div>
      {problem && (
        <div>
          <p className="mb-1.5 font-medium">Dove?</p>
          <div className="flex flex-wrap gap-1.5">{WHERE.map((w) => chip(w, where === w, () => setWhere(where === w ? null : w)))}</div>
        </div>
      )}
      {problem && where && (
        <button
          type="button"
          disabled={status === 'sending'}
          onClick={send}
          className="w-full rounded-full bg-rose-500 py-2.5 font-semibold text-[#fff] active:scale-95 disabled:opacity-60"
        >
          {status === 'sending' ? 'Invio…' : 'Invia segnalazione'}
        </button>
      )}
      {status === 'error' && <p className="text-xs text-rose-600">Non è partita: controlla la connessione e riprova.</p>}
      {status === 'limit' && <p className="text-xs text-neutral-500">Per oggi ne hai già mandate parecchie, grazie! Riprova domani.</p>}
    </div>
  )
}

export const ProblemReportIcon = MessageSquareWarning
