import { Loader2, Mail, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { hasSupabase, supabaseRpc } from '../lib/supabase'

interface Item {
  id: number
  created_at: string
  subject: string
  test: boolean
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled'
  total: number | null
  sent_count: number
  error: string | null
}

const STATUS: Record<Item['status'], string> = {
  pending: 'In coda',
  sending: 'In invio',
  sent: 'Inviata',
  failed: 'Bloccata',
  cancelled: 'Annullata',
}

/** Email scritta a mano a tutti gli account (la manda GitHub Actions entro una decina di minuti). */
export function AdminBroadcast() {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [info, setInfo] = useState<{ recipients: number; items: Item[] } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const [version, setVersion] = useState(0)
  const refresh = () => setVersion((v) => v + 1)

  useEffect(() => {
    if (!hasSupabase) return
    let cancelled = false
    supabaseRpc('admin_broadcasts').then(({ data, error }) => {
      if (cancelled) return
      if (error) setError(error.message.includes('admin_broadcasts') ? 'Manca lo script schema-3.sql in Supabase.' : error.message)
      else setInfo(data as { recipients: number; items: Item[] })
    })
    return () => {
      cancelled = true
    }
  }, [version])

  const amazonLink = /\b(?:amazon\.[a-z.]+|amzn\.(?:to|eu))\b/i.test(`${subject} ${body}`)
  const valid = subject.trim().length >= 3 && body.trim().length >= 10 && !amazonLink

  const queue = async (test: boolean) => {
    if (!hasSupabase || !valid || busy) return
    if (!test && !window.confirm(`Inviare "${subject.trim()}" a ${info?.recipients ?? 0} persone? Non si può annullare una volta partita.`)) return
    setBusy(true)
    setNotice('')
    const { error } = await supabaseRpc('admin_broadcast_create', { subject: subject.trim(), body: body.trim(), test })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setNotice(test ? 'Prova in coda: arriva a te entro una decina di minuti.' : 'In coda: parte entro una decina di minuti.')
    if (!test) {
      setSubject('')
      setBody('')
    }
    refresh()
  }

  const cancel = async (id: number) => {
    if (!hasSupabase) return
    await supabaseRpc('admin_broadcast_cancel', { broadcast_id: id })
    refresh()
  }

  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-neutral-200">
      <h2 className="flex items-center gap-2 font-semibold">
        <Mail className="size-5" /> Email a tutti
      </h2>
      {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        maxLength={120}
        placeholder="Oggetto"
        className="h-11 w-full rounded-xl bg-neutral-50 px-3 text-base ring-1 ring-neutral-200 outline-none focus:ring-2 focus:ring-neutral-900"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={5000}
        rows={7}
        placeholder={'Messaggio\n\nUna riga vuota = nuovo paragrafo. I link https://… diventano cliccabili.'}
        className="w-full rounded-xl bg-neutral-50 p-3 text-base ring-1 ring-neutral-200 outline-none focus:ring-2 focus:ring-neutral-900"
      />
      {!amazonLink && (subject || body) && !valid && (
        <p className="text-sm text-neutral-500">
          {subject.trim().length < 3 ? "L'oggetto deve avere almeno 3 caratteri." : `Il messaggio deve avere almeno 10 caratteri (ora ${body.trim().length}).`}
        </p>
      )}
      {amazonLink && <p className="text-sm text-rose-600">Niente link Amazon nelle email: le regole di Amazon Associates non lo permettono.</p>}
      <p className="text-xs text-neutral-500">
        Va a {info ? info.recipients : '…'} account confermati che non hanno spento le comunicazioni dal Profilo. In fondo all'email c'è
        il link per disattivarle. Niente prezzi o link Amazon.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void queue(true)}
          disabled={!valid || busy}
          className="flex-1 rounded-full bg-white py-2.5 text-sm font-semibold ring-1 ring-neutral-300 active:scale-95 disabled:opacity-40"
        >
          Prova a me
        </button>
        <button
          type="button"
          onClick={() => void queue(false)}
          disabled={!valid || busy || !info?.recipients}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-rose-500 py-2.5 text-sm font-semibold text-[#fff] active:scale-95 disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Invia a tutti
        </button>
      </div>
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}

      {info && info.items.length > 0 && (
        <ul className="divide-y divide-neutral-100 text-sm">
          {info.items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {it.test && <span className="text-neutral-400">[prova] </span>}
                  {it.subject}
                </span>
                <span className="text-xs text-neutral-500">
                  {new Date(it.created_at).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })} · {STATUS[it.status]}
                  {it.total !== null && ` · ${it.sent_count}/${it.total}`}
                  {it.error && ` · ${it.error}`}
                </span>
              </span>
              {it.status === 'pending' && (
                <button type="button" onClick={() => void cancel(it.id)} className="text-xs font-medium text-rose-600 underline">
                  Annulla
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
