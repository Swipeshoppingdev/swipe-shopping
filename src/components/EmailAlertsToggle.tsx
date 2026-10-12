import { useEffect, useState } from 'react'
import { pushAvailable } from '../lib/push'
import { supabase } from '../lib/supabase'
import { useAuth } from '../state/AuthState'

/** Preferenza "avvisami (notifica o email) quando un preferito è in offerta" (colonna user_data.email_alerts). */
export function EmailAlertsToggle() {
  return (
    <EmailPrefToggle
      column="email_alerts"
      label="Avvisami quando un preferito è in offerta"
      hint={pushAvailable ? 'Con una notifica (se attive) o via email, al massimo ogni 3 giorni.' : "Via email (nell'app Android con una notifica), al massimo ogni 3 giorni."}
    />
  )
}

/** Comunicazioni scritte dal titolare (colonna user_data.email_news, vedi supabase/schema-3.sql). */
export function EmailNewsToggle() {
  return <EmailPrefToggle column="email_news" label="Ricevi le comunicazioni di Swipe Shopping" hint="Novità sull'app, ogni tanto." />
}

function EmailPrefToggle({ column, label, hint }: { column: 'email_alerts' | 'email_news'; label: string; hint: string }) {
  const { user } = useAuth()
  const userId = user?.id
  const [value, setValue] = useState<{ userId: string; on: boolean } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase || !userId) return
    let cancelled = false
    supabase
      .from('user_data')
      .select(column)
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        // Colonna assente (script non ancora eseguito): nascondo l'opzione.
        if (!cancelled && !error) setValue({ userId, on: (data as Record<string, boolean | undefined> | null)?.[column] ?? true })
      })
    return () => {
      cancelled = true
    }
  }, [userId, column])

  if (!supabase || !userId || value?.userId !== userId) return null

  const change = async (on: boolean) => {
    setValue({ userId, on })
    setError('')
    const { error } = await supabase!.from('user_data').upsert({ user_id: userId, [column]: on })
    if (error) {
      setValue({ userId, on: !on })
      setError('Non sono riuscito a salvare, riprova.')
    }
  }

  return (
    <div>
      <label className="flex items-center justify-between gap-4">
        <span>
          {label}
          <span className="block text-xs text-neutral-500">{hint}</span>
        </span>
        <input
          type="checkbox"
          checked={value.on}
          onChange={(e) => void change(e.target.checked)}
          className="size-5 shrink-0 accent-neutral-900"
        />
      </label>
      {error && <p className="mt-1 text-rose-600">{error}</p>}
    </div>
  )
}
