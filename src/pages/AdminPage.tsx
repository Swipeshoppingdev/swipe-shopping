import { BarChart3, Loader2, Lock, Megaphone } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { isAdminEmail } from '../lib/admin'
import { UNIVERSES, categoryLabel, isCategoryId } from '../config/categories'
import { reasonLabel, type ReportRow } from '../lib/reports'
import { openProduct } from '../lib/productSheet'
import { hasSupabase, supabaseRpc } from '../lib/supabase'
import { AdminBroadcast } from '../components/AdminBroadcast'
import { AdminInsights } from '../components/AdminInsights'
import { AdminOverview, PhoneStats } from '../components/AdminOverview'
import { ProductImage } from '../components/ProductImage'
import { routeHref } from '../lib/useHashRoute'
import { useApp } from '../state/AppState'
import { useAuth } from '../state/AuthState'

interface Ranked {
  id: string
  n: number
}
interface AdminStats {
  users_total: number
  users_new_7d: number
  alerts_on: number
  devices_today: number
  devices_7d: number
  devices_period: number
  totals: Partial<Record<'session' | 'view' | 'like' | 'dislike' | 'click' | 'remove' | 'share' | 'outfit_like' | 'outfit_dislike' | 'outfit_share', number>>
  daily: { day: string; devices: number; views: number; likes: number; clicks: number }[]
  top_clicked: Ranked[]
  top_liked: Ranked[]
  top_categories: Ranked[]
  top_brands: Ranked[]
}

const PERIODS = [7, 30, 90] as const

/** Statistiche complessive dell'app, visibili solo all'account del titolare. */
export function AdminPage() {
  return <AdminOnly>{() => <AdminStatsView />}</AdminOnly>
}

/** "Comunicazioni" (link in Profilo sotto Studio): email a tutti gli iscritti. Prima stava in Statistiche. */
export function CommsPage() {
  return (
    <AdminOnly>
      {() => (
        <div className="space-y-4 pb-6">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Megaphone className="size-6" /> Comunicazioni
          </h1>
          <AdminBroadcast />
        </div>
      )}
    </AdminOnly>
  )
}

function AdminOnly({ children }: { children: () => ReactNode }) {
  const auth = useAuth()
  const isAdmin = isAdminEmail(auth.user?.email)

  if (!auth.ready) return <p className="py-10 text-center text-sm text-neutral-500">Caricamento…</p>
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-neutral-600">
        <Lock className="size-8 text-neutral-400" />
        <p>Questa pagina è riservata.</p>
        <a href={routeHref('profilo')} className="font-medium text-rose-600 underline">
          Vai al Profilo
        </a>
      </div>
    )
  }
  return <>{children()}</>
}

function AdminStatsView() {
  const { allProducts: products } = useApp()
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30)
  const [result, setResult] = useState<{ days: number; stats?: AdminStats; error?: string } | null>(null)

  useEffect(() => {
    if (!hasSupabase) return
    let cancelled = false
    supabaseRpc('admin_stats', { days }).then(({ data, error }) => {
      if (cancelled) return
      setResult(
        error
          ? { days, error: error.message.includes('admin_stats') ? 'Manca lo script schema-2.sql in Supabase.' : error.message }
          : { days, stats: data as AdminStats },
      )
    })
    return () => {
      cancelled = true
    }
  }, [days])

  const loading = result?.days !== days
  const stats = result?.stats
  const titleOf = (id: string) => products.find((p) => p.id === id)?.title ?? id.replace(/^amazon:/, 'ASIN ')
  const t = stats?.totals ?? {}
  const views = t.view ?? 0
  const clicks = t.click ?? 0
  const likes = t.like ?? 0
  const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '–')

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <BarChart3 className="size-6" /> Statistiche
        </h1>
        <div className="flex rounded-full bg-neutral-100 p-1 text-sm font-medium">
          {PERIODS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`rounded-full px-3 py-1 ${days === d ? 'bg-white shadow-sm' : 'text-neutral-500'}`}
            >
              {d} gg
            </button>
          ))}
        </div>
      </div>

      <Section title="Panoramica">
        <AdminOverview />
      </Section>
      <AdminErrors />
      <AdminReports />

      {loading && !stats && (
        <p className="flex items-center justify-center gap-2 py-10 text-sm text-neutral-500">
          <Loader2 className="size-4 animate-spin" /> Carico i numeri…
        </p>
      )}
      {result?.error && !loading && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{result.error}</p>}

      {stats && (
        <div className={`space-y-5 transition-opacity ${loading ? 'opacity-50' : ''}`}>
          <Section title="Persone">
            <Grid>
              <Stat label="Oggi" value={stats.devices_today} />
              <Stat label="Ultimi 7 giorni" value={stats.devices_7d} />
              <Stat label={`Ultimi ${days} giorni`} value={stats.devices_period} />
              <Stat label="Account creati (anche non confermati)" value={stats.users_total} hint={`+${stats.users_new_7d} in 7 gg`} />
            </Grid>
            <p className="mt-2 text-xs text-neutral-500">
              Conta i dispositivi che hanno accettato le statistiche anonime. {stats.alerts_on} account ricevono gli avvisi
              di prezzo.
            </p>
          </Section>

          <Section title={`Attività (${days} giorni)`}>
            <Grid>
              <Stat label="Prodotti visti" value={views} />
              <Stat label="Mi piace" value={likes} hint={pct(likes, views)} />
              <Stat label="Click ai negozi" value={clicks} hint={pct(clicks, views)} />
              <Stat label="Condivisioni" value={t.share ?? 0} />
            </Grid>
          </Section>

          {stats.daily.length > 0 && (
            <Section title="Giorno per giorno">
              <Daily rows={stats.daily} />
            </Section>
          )}

          <AdminInsights
            days={days}
            current={{ devices: stats.devices_period, views, likes, clicks, shares: (t.share ?? 0) + (t.outfit_share ?? 0) }}
          />

          <Ranking title="Più cliccati" rows={stats.top_clicked} label={titleOf} />
          <Ranking title="Più salvati nei preferiti" rows={stats.top_liked} label={titleOf} />
          <Ranking title="Categorie (mi piace + click)" rows={stats.top_categories} label={(id) => (isCategoryId(id) ? categoryLabel(id) : id)} />
          <Ranking title="Marche (mi piace + click)" rows={stats.top_brands} label={(id) => id} />
        </div>
      )}
      <Section title="Questo telefono">
        <PhoneStats />
      </Section>
    </div>
  )
}

type ErrorRow = { id: number; happened_at: string; kind: string; message: string; stack?: string; route?: string; ua?: string; native: boolean }

/** Errori dell'app arrivati dai telefoni (anonimi): da copiare e mandare a Claude. Sempre visibile, con "0 errori" se è vuoto. */
function AdminErrors() {
  const [all, setRows] = useState<ErrorRow[] | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!hasSupabase) return
    supabaseRpc('admin_errors').then(({ data, error }) => {
      if (error) setError(error.message.includes('admin_errors') ? 'Manca lo script schema-16.sql in Supabase.' : error.message)
      else setRows((data as ErrorRow[]) ?? [])
    })
  }, [])
  if (error) return <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">Errori dell'app: {error}</p>
  // La chiamata va attesa con then(): senza, supabase-js non la manda mai (gli errori tornavano). Svuota anche le segnalazioni.
  const clear = () => void supabaseRpc('admin_errors_clear').then(({ error }) => (error ? alert(`Non svuotato: ${error.message}`) : setRows([])))
  const feedback = all?.filter((r) => r.kind === 'segnalazione') ?? []
  const rows = all?.filter((r) => r.kind !== 'segnalazione') ?? []
  const whenF = (iso: string) => new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const feedbackBox = feedback.length > 0 && (
    <Section title={`Segnalazioni degli utenti (${feedback.length})`}>
      <ul className="space-y-2 text-sm">
        {feedback.map((r) => (
          <li key={r.id}>
            <span className="block font-medium">{r.message}</span>
            <span className="block text-xs text-neutral-500">
              {whenF(r.happened_at)} · {r.native ? 'App Android' : /iPhone|iPad/.test(r.ua ?? '') ? 'Sito iPhone' : /Android/.test(r.ua ?? '') ? 'Sito Android' : 'Sito'} · {r.stack}
            </span>
          </li>
        ))}
      </ul>
      {!rows.length && (
        <button type="button" onClick={clear} className="mt-3 rounded-full px-4 py-2 text-sm font-medium text-neutral-600 ring-1 ring-neutral-200">
          Svuota
        </button>
      )}
    </Section>
  )
  if (!all) return null
  if (!rows.length)
    return (
      <>
        {feedbackBox}
        <Section title="Errori dell'app (0)">
          <p className="text-sm text-neutral-500">0 errori: nessun problema dai telefoni.</p>
        </Section>
      </>
    )
  const when = (iso: string) => new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const device = (r: ErrorRow) => (r.native ? 'App Android' : /iPhone|iPad/.test(r.ua ?? '') ? 'Sito iPhone' : /Android/.test(r.ua ?? '') ? 'Sito Android' : 'Sito')
  const text = rows.map((r) => `${r.happened_at} [${r.kind}] ${device(r)} ${r.route ?? ''}\n${r.message}\n${r.stack ?? ''}\n${r.ua ?? ''}`).join('\n\n')
  return (
    <>
    {feedbackBox}
    <Section title={`Errori dell'app (${rows.length})`}>
      <ul className="space-y-3 text-sm">
        {rows.slice(0, 10).map((r) => (
          <li key={r.id}>
            <span className="block text-xs text-neutral-500">
              {when(r.happened_at)} · {device(r)} · {r.route || '#/'}
            </span>
            <span className="block font-medium break-all">{r.message}</span>
            {r.stack && (
              <details className="text-xs text-neutral-500">
                <summary>Dettagli</summary>
                <pre className="mt-1 max-h-48 overflow-auto text-[10px] break-all whitespace-pre-wrap">{r.stack}</pre>
              </details>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
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
          onClick={clear}
          className="rounded-full px-4 py-2 text-sm font-medium text-neutral-600 ring-1 ring-neutral-200"
        >
          Svuota
        </button>
      </div>
    </Section>
    </>
  )
}

/** Prodotti segnalati dagli utenti, con i motivi. "Sistemato" toglie le segnalazioni di quel prodotto. */
function AdminReports() {
  const { allProducts, state } = useApp()
  // Le altre sezioni arrivano qualche secondo dopo: fino ad allora un prodotto mancante non è "sparito".
  const allLoaded = state.catalog.status === 'ready' && state.catalog.sections.length === UNIVERSES.length
  const [rows, setRows] = useState<ReportRow[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!hasSupabase) return
    supabaseRpc('admin_reports').then(({ data, error }) => {
      if (error) setError(error.message.includes('admin_reports') ? 'Manca lo script schema-12.sql in Supabase.' : error.message)
      else setRows((data as ReportRow[]) ?? [])
    })
  }, [])
  const done = (id: string) => {
    setRows((r) => r?.filter((x) => x.id !== id) ?? null)
    void supabaseRpc('admin_report_done', { p_product_id: id }).then(({ error }) => error && alert(`Non salvato: ${error.message}`))
  }
  if (error) return <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">Segnalazioni: {error}</p>
  if (!rows) return null
  return (
    <Section title={`Prodotti segnalati${rows.length ? ` (${rows.length})` : ''}`}>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">Nessuna segnalazione.</p>
      ) : (
        <ul className="space-y-3 text-sm">
          {rows.map((r) => {
            const p = allProducts.find((x) => x.id === r.id)
            return (
              <li key={r.id} className="flex items-start justify-between gap-3">
                {/* Tocca per aprire la scheda del prodotto, come nell'app. */}
                <button type="button" disabled={!p} onClick={() => p && openProduct(p)} className="flex min-w-0 gap-3 text-left">
                  {p && <ProductImage product={p} className="size-14 shrink-0 rounded-xl ring-1 ring-black/5" />}
                  <span className="min-w-0">
                    <span className="line-clamp-2 font-medium">{p?.title ?? (allLoaded ? 'Non più nel catalogo' : 'Caricamento…')}</span>
                    <span className="block text-xs text-neutral-500">
                      {[p?.brand, p && categoryLabel(p.category), r.id.replace(/^amazon:/, 'ASIN ')].filter(Boolean).join(' · ')}
                    </span>
                    <span className="block text-xs font-medium text-rose-600">
                      {Object.entries(r.reasons)
                        .map(([k, n]) => `${reasonLabel(k)}${n > 1 ? ` ×${n}` : ''}`)
                        .join(' · ')}
                    </span>
                  </span>
                </button>
                <button type="button" onClick={() => done(r.id)} className="shrink-0 rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold active:scale-95">
                  Sistemato
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  )
}

const Grid = ({ children }: { children: ReactNode }) => (
  <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">{children}</div>
)

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl bg-neutral-50 py-2">
      <div className="text-lg font-bold">{value.toLocaleString('it-IT')}</div>
      <div className="text-xs text-neutral-500">{label}</div>
      {hint && <div className="text-[11px] text-neutral-400">{hint}</div>}
    </div>
  )
}

function Daily({ rows }: { rows: AdminStats['daily'] }) {
  const max = Math.max(1, ...rows.map((r) => r.devices))
  const fmt = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
  return (
    <div className="space-y-1.5 text-xs">
      {[...rows].reverse().map((r) => (
        <div key={r.day} className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-neutral-500">{fmt(r.day)}</span>
          <div className="h-4 flex-1 rounded bg-neutral-100">
            <div className="h-4 rounded bg-rose-400" style={{ width: `${(r.devices / max) * 100}%` }} />
          </div>
          <span className="w-28 shrink-0 text-right text-neutral-600">
            {r.devices} pers · {r.clicks} click
          </span>
        </div>
      ))}
    </div>
  )
}

function Ranking({ title, rows, label }: { title: string; rows: Ranked[]; label: (id: string) => string }) {
  if (rows.length === 0) return null
  return (
    <Section title={title}>
      <ol className="space-y-1.5 text-sm">
        {rows.map((r, i) => (
          <li key={r.id} className="flex justify-between gap-3">
            <span className="truncate">
              <span className="mr-2 text-neutral-400">{i + 1}.</span>
              {label(r.id)}
            </span>
            <span className="shrink-0 font-medium">{r.n}</span>
          </li>
        ))}
      </ol>
    </Section>
  )
}
