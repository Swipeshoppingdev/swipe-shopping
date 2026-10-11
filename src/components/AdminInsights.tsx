import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { SECTIONS, categoryLabel, isCategoryId, universeOf } from '../config/categories'
import { STORES, type StoreId } from '../config/stores'
import { STYLE_LABEL, type OutfitStyle } from '../lib/outfits'
import { freshPrice } from '../lib/price'
import { supabase } from '../lib/supabase'
import { useApp } from '../state/AppState'

interface Counts {
  id: string
  views: number
  likes: number
  dislikes?: number
  clicks: number
}
interface Insights {
  prev: { devices: number; views: number; likes: number; clicks: number; shares: number }
  loyalty: { devices: number; new: number; returning: number; avg_days: number; avg_views: number; avg_sessions: number }
  categories: (Counts & { dislikes: number })[]
  brands: Counts[]
  stores: Record<string, number>
  hours: Record<string, number>
  weekdays: Record<string, number>
  outfits: { id: string; likes: number; dislikes: number; shares: number }[]
}
/** I numeri del periodo, per il confronto con quello prima */
export interface PeriodTotals {
  devices: number
  views: number
  likes: number
  clicks: number
  shares: number
}

/** Sotto queste viste una percentuale non vuol dire niente: la categoria o la marca non entra nelle classifiche. */
const MIN_VIEWS_CATEGORY = 30
const MIN_VIEWS_BRAND = 20
const DAYS = ['', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0)
const fmtPct = (v: number) => `${v.toFixed(v < 10 ? 1 : 0)}%`

/** Le statistiche "per decidere": crescita, fedeltà, cosa piace e cosa no, orari, outfit, catalogo. */
export function AdminInsights({ days, current }: { days: number; current: PeriodTotals | null }) {
  const [result, setResult] = useState<{ days: number; data?: Insights; error?: string } | null>(null)
  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    supabase.rpc('admin_insights', { days }).then(({ data, error }) => {
      if (cancelled) return
      setResult(
        error
          ? { days, error: error.message.includes('admin_insights') ? 'Per le statistiche avanzate esegui lo script schema-13.sql in Supabase.' : error.message }
          : { days, data: data as Insights },
      )
    })
    return () => {
      cancelled = true
    }
  }, [days])

  const data = result?.days === days ? result.data : undefined
  return (
    <div className="space-y-5">
      {result?.error && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{result.error}</p>}
      {data && current && <Growth days={days} now={current} prev={data.prev} />}
      {data && <Loyalty l={data.loyalty} />}
      {data && <Sections rows={data.categories} />}
      {data && (
        <BestWorst
          title="Categorie"
          rows={data.categories}
          min={MIN_VIEWS_CATEGORY}
          label={(id) => (isCategoryId(id) ? categoryLabel(id) : id)}
          tip="Quelle che piacciono di più conviene ampliarle nel catalogo; quelle che piacciono meno si possono ridurre."
        />
      )}
      {data && <BestWorst title="Marche" rows={data.brands} min={MIN_VIEWS_BRAND} label={(id) => id} />}
      {data && <Stores clicks={data.stores} />}
      {data && <Hours hours={data.hours} weekdays={data.weekdays} />}
      {data && <Outfits rows={data.outfits} />}
      <Catalog />
    </div>
  )
}

function Growth({ days, now, prev }: { days: number; now: PeriodTotals; prev: Insights['prev'] }) {
  const items: [string, number, number][] = [
    ['Persone', now.devices, prev.devices],
    ['Prodotti visti', now.views, prev.views],
    ['Mi piace', now.likes, prev.likes],
    ['Click ai negozi', now.clicks, prev.clicks],
    ['Condivisioni', now.shares, prev.shares],
  ]
  return (
    <Box title={`Crescita: ultimi ${days} giorni contro i ${days} prima`}>
      <ul className="space-y-1.5 text-sm">
        {items.map(([label, a, b]) => {
          const change = b ? ((a - b) / b) * 100 : null
          return (
            <li key={label} className="flex items-center justify-between gap-3">
              <span>{label}</span>
              <span className="flex items-center gap-2">
                <span className="text-neutral-500">
                  {b.toLocaleString('it-IT')} → <b className="text-neutral-900">{a.toLocaleString('it-IT')}</b>
                </span>
                <span
                  className={`w-16 rounded-full px-2 py-0.5 text-center text-xs font-semibold ${
                    change === null ? 'bg-neutral-100 text-neutral-500' : change >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                  }`}
                >
                  {change === null ? (a ? 'nuovo' : '–') : `${change >= 0 ? '+' : ''}${change.toFixed(0)}%`}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </Box>
  )
}

function Loyalty({ l }: { l: Insights['loyalty'] }) {
  return (
    <Box title="Fedeltà">
      <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        <Tile value={l.new.toLocaleString('it-IT')} label="Persone nuove" hint={l.devices ? `${fmtPct(pct(l.new, l.devices))} del totale` : undefined} />
        <Tile value={l.returning.toLocaleString('it-IT')} label="Tornano" hint={l.devices ? `${fmtPct(pct(l.returning, l.devices))} (2+ giorni)` : undefined} />
        <Tile value={String(l.avg_days).replace('.', ',')} label="Giorni attivi a testa" />
        <Tile value={String(l.avg_views).replace('.', ',')} label="Prodotti visti a testa" />
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        "Tornano" è la cifra più importante: dice se l'app piace abbastanza da riaprirla.
      </p>
    </Box>
  )
}

function Sections({ rows }: { rows: Insights['categories'] }) {
  const bySection = useMemo(() => {
    const m = new Map<string, { views: number; likes: number; clicks: number }>()
    for (const r of rows) {
      if (!isCategoryId(r.id)) continue
      const u = universeOf(r.id)
      const s = m.get(u) ?? { views: 0, likes: 0, clicks: 0 }
      s.views += r.views
      s.likes += r.likes
      s.clicks += r.clicks
      m.set(u, s)
    }
    return SECTIONS.map((s) => ({ ...s, ...(m.get(s.id) ?? { views: 0, likes: 0, clicks: 0 }) })).sort((a, b) => b.views - a.views)
  }, [rows])
  const max = Math.max(1, ...bySection.map((s) => s.views))
  return (
    <Box title="Sezioni">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-neutral-500">
            <th className="pb-1 text-left font-medium">Sezione</th>
            <th className="pb-1 text-right font-medium">Viste</th>
            <th className="pb-1 text-right font-medium">Sì</th>
            <th className="pb-1 text-right font-medium">Click</th>
          </tr>
        </thead>
        <tbody>
          {bySection.map((s) => (
            <tr key={s.id}>
              <td className="py-1">
                <span className="flex items-center gap-2">
                  <span className="h-2 rounded-full" style={{ width: `${Math.max(4, (s.views / max) * 48)}px`, background: s.color }} />
                  {s.label}
                </span>
              </td>
              <td className="py-1 text-right">{s.views.toLocaleString('it-IT')}</td>
              <td className="py-1 text-right">{s.views ? fmtPct(pct(s.likes, s.views)) : '–'}</td>
              <td className="py-1 text-right">{s.views ? fmtPct(pct(s.clicks, s.views)) : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-neutral-500">Sì e click sono in percentuale sui prodotti visti.</p>
    </Box>
  )
}

function BestWorst({ title, rows, min, label, tip }: { title: string; rows: Counts[]; min: number; label: (id: string) => string; tip?: string }) {
  const ranked = rows
    .filter((r) => r.views >= min)
    .map((r) => ({ ...r, like: pct(r.likes, r.views), click: pct(r.clicks, r.views) }))
    .sort((a, b) => b.like - a.like)
  const [tab, setTab] = useState<'best' | 'worst' | 'clicks'>('best')
  const list =
    tab === 'best' ? ranked.slice(0, 8) : tab === 'worst' ? [...ranked].reverse().slice(0, 8) : [...ranked].sort((a, b) => b.click - a.click).slice(0, 8)
  return (
    <Box title={title}>
      {ranked.length < 2 ? (
        <p className="text-sm text-neutral-500">Servono almeno {min} prodotti visti per {title.toLowerCase().replace(/e$/, 'a')} per fare una classifica: ancora pochi dati.</p>
      ) : (
        <>
          <div className="mb-3 flex gap-1 text-xs font-semibold">
            {(
              [
                ['best', 'Piacciono di più'],
                ['worst', 'Piacciono meno'],
                ['clicks', 'Più click'],
              ] as const
            ).map(([id, text]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded-full px-3 py-1 ${tab === id ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'}`}
              >
                {text}
              </button>
            ))}
          </div>
          <ol className="space-y-1.5 text-sm">
            {list.map((r, i) => (
              <li key={r.id} className="flex justify-between gap-3">
                <span className="truncate">
                  <span className="mr-2 text-neutral-400">{i + 1}.</span>
                  {label(r.id)}
                </span>
                <span className="shrink-0 text-neutral-500">
                  <b className="text-neutral-900">{fmtPct(tab === 'clicks' ? r.click : r.like)}</b> {tab === 'clicks' ? 'click' : 'sì'} · {r.views} viste
                </span>
              </li>
            ))}
          </ol>
          {tip && <p className="mt-2 text-xs text-neutral-500">{tip}</p>}
        </>
      )}
    </Box>
  )
}

function Stores({ clicks }: { clicks: Record<string, number> }) {
  const rows = Object.entries(clicks).sort((a, b) => b[1] - a[1])
  const total = rows.reduce((s, [, n]) => s + n, 0)
  if (!total) return null
  return (
    <Box title="Click per negozio">
      <ul className="space-y-1.5 text-sm">
        {rows.map(([id, n]) => (
          <li key={id} className="flex items-center gap-2">
            <span className="w-24 shrink-0 truncate">{STORES[id as StoreId]?.name ?? id}</span>
            <div className="h-3 flex-1 rounded bg-neutral-100">
              <div className="h-3 rounded bg-neutral-800" style={{ width: `${pct(n, total)}%` }} />
            </div>
            <span className="w-20 shrink-0 text-right text-neutral-600">
              {n} · {fmtPct(pct(n, total))}
            </span>
          </li>
        ))}
      </ul>
    </Box>
  )
}

function Hours({ hours, weekdays }: { hours: Record<string, number>; weekdays: Record<string, number> }) {
  const h = Array.from({ length: 24 }, (_, i) => hours[i] ?? 0)
  const max = Math.max(1, ...h)
  const total = h.reduce((a, b) => a + b, 0)
  if (!total) return null
  // Le 3 ore consecutive con più attività: il momento migliore per pubblicare sui social.
  let best = 0
  for (let i = 0; i < 24; i++) if (h[i] + h[(i + 1) % 24] + h[(i + 2) % 24] > h[best] + h[(best + 1) % 24] + h[(best + 2) % 24]) best = i
  const w = Array.from({ length: 7 }, (_, i) => weekdays[i + 1] ?? 0)
  const wMax = Math.max(1, ...w)
  const bestDay = w.indexOf(Math.max(...w)) + 1
  return (
    <Box title="Quando usano l'app">
      <div className="flex h-20 items-end gap-0.5">
        {h.map((n, i) => (
          <div key={i} className="flex-1 rounded-t bg-rose-400" style={{ height: `${Math.max(2, (n / max) * 100)}%`, opacity: i >= best && i < best + 3 ? 1 : 0.45 }} title={`${i}:00 · ${n}`} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-neutral-400">
        <span>0</span>
        <span>6</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>
      <div className="mt-3 flex items-end gap-1">
        {w.map((n, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div className="w-full rounded bg-neutral-100">
              <div className="rounded bg-neutral-700" style={{ height: `${Math.max(3, (n / wMax) * 36)}px` }} />
            </div>
            <span className="text-[10px] text-neutral-500">{DAYS[i + 1]}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        Più attività tra le {best}:00 e le {(best + 3) % 24}:00, giorno migliore {DAYS[bestDay].toLowerCase()}: i momenti giusti per pubblicare su
        Instagram e TikTok.
      </p>
    </Box>
  )
}

function Outfits({ rows }: { rows: Insights['outfits'] }) {
  const list = rows
    .map((r) => ({ ...r, total: r.likes + r.dislikes }))
    .filter((r) => r.total > 0 || r.shares > 0)
    .sort((a, b) => pct(b.likes, b.total) - pct(a.likes, a.total))
  return (
    <Box title="Outfit per stile">
      {list.length === 0 ? (
        <p className="text-sm text-neutral-500">Ancora nessun dato: si contano da questo aggiornamento.</p>
      ) : (
        <ol className="space-y-1.5 text-sm">
          {list.map((r) => (
            <li key={r.id} className="flex justify-between gap-3">
              <span className="truncate">{STYLE_LABEL[r.id as OutfitStyle] ?? r.id}</span>
              <span className="shrink-0 text-neutral-500">
                <b className="text-neutral-900">{r.total ? fmtPct(pct(r.likes, r.total)) : '–'}</b> sì su {r.total}
                {r.shares ? ` · ${r.shares} condiviso` : ''}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Box>
  )
}

/** Stato del catalogo (dal file caricato dall'app, non da Supabase). */
function Catalog() {
  const { allProducts, state } = useApp()
  const rows = useMemo(() => {
    const now = Date.now()
    return SECTIONS.map((s) => {
      const list = allProducts.filter((p) => isCategoryId(p.category) && universeOf(p.category) === s.id)
      return {
        ...s,
        total: list.length,
        priced: list.filter((p) => freshPrice(p, now)).length,
        fresh: list.filter((p) => now - Date.parse(p.addedAt) < 86_400_000).length,
      }
    })
  }, [allProducts])
  const loaded = state.catalog.status === 'ready' && state.catalog.sections.length === SECTIONS.length
  return (
    <Box title="Catalogo">
      {!loaded && <p className="mb-2 text-xs text-neutral-500">Sto ancora caricando alcune sezioni…</p>}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-neutral-500">
            <th className="pb-1 text-left font-medium">Sezione</th>
            <th className="pb-1 text-right font-medium">Prodotti</th>
            <th className="pb-1 text-right font-medium">Con prezzo</th>
            <th className="pb-1 text-right font-medium">Arrivati 24h</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="py-1">{r.label}</td>
              <td className="py-1 text-right">{r.total.toLocaleString('it-IT')}</td>
              <td className="py-1 text-right">{r.total ? fmtPct(pct(r.priced, r.total)) : '–'}</td>
              <td className="py-1 text-right">{r.fresh.toLocaleString('it-IT')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-neutral-500">"Con prezzo": prezzo aggiornato nelle ultime 24 ore, quindi mostrabile.</p>
    </Box>
  )
}

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Tile({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-neutral-50 py-2">
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs text-neutral-500">{label}</div>
      {hint && <div className="text-[11px] text-neutral-400">{hint}</div>}
    </div>
  )
}
