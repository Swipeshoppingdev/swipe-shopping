import { useEffect, useState } from 'react'
import { categoryLabel, isCategoryId } from '../config/categories'
import { summary } from '../lib/analytics'
import { useConsent } from '../lib/useConsent'
import { useApp } from '../state/AppState'

type Overview = Record<string, number>

/** Pagina Statistiche (admin): panoramica dal database (admin_overview, schema-18.sql). Senza lo script mostra almeno gli utenti registrati. */
export function AdminOverview() {
  const [o, setO] = useState<Overview | null>(null)
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    let alive = true
    void import('../lib/supabase').then(async ({ supabase }) => {
      if (!supabase) return
      const { data, error } = await supabase.rpc('admin_overview')
      if (!alive) return
      if (!error && data) return setO(data as Overview)
      // Script non ancora eseguito: il totale degli account c'è già in admin_stats.
      const old = await supabase.rpc('admin_stats', { days: 1 })
      const d = old.data as Overview | null
      if (alive && d) {
        setMissing(true)
        setO({ users_total: d.users_total, users_new_7d: d.users_new_7d, alerts_on: d.alerts_on })
      }
    })
    return () => {
      alive = false
    }
  }, [])
  if (!o) return null
  const n = (k: string) => o[k] ?? 0
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '–')
  const groups: [string, [string, number | string, string?][]][] = [
    [
      'Utenti registrati',
      [
        ['Totale', n('users_total'), `+${n('users_new_7d')} in 7 gg`],
        ...(missing
          ? []
          : ([
              ['Nuovi oggi', n('users_new_today'), `${n('users_new_30d')} in 30 gg`],
              ['Email confermate', n('users_confirmed'), pct(n('users_confirmed'), n('users_total'))],
              ['Con Google', n('users_google'), pct(n('users_google'), n('users_total'))],
              ['Entrati in 7 gg', n('users_active_7d')],
              ['Con preferiti', n('users_with_wishlist'), `${n('wishlist_items')} salvati`],
            ] as [string, number | string, string?][])),
      ],
    ],
    ...(missing
      ? []
      : ([
          [
            'Contatti e avvisi',
            [
              ['Newsletter sì', n('news_optin'), pct(n('news_optin'), n('users_total'))],
              ['Avvisi prezzo email', n('alerts_on')],
              ['Notifiche app Android', n('push_android')],
              ['Notifiche dal sito', n('push_web')],
              ['Usano la 🔔', n('watchers')],
              ['Seguono marche', n('brand_followers')],
              ['Avvisi prezzo mandati', n('price_alerts_7d'), 'ultimi 7 gg'],
              ['Avvisi marche mandati', n('brand_alerts_7d'), 'ultimi 7 gg'],
            ],
          ],
          [
            'Visitatori',
            [
              ['Oggi', n('devices_today')],
              ['Ultimi 7 gg', n('devices_7d'), `${n('devices_30d')} in 30 gg`],
              ['Tornati in 7 gg', n('devices_returning_7d'), pct(n('devices_returning_7d'), n('devices_7d'))],
              ['Aperture in 7 gg', n('sessions_7d')],
              ['Swipe a testa', n('devices_7d') ? Math.round(n('views_7d') / n('devices_7d')) : 0, 'ultimi 7 gg'],
              ['Mi piace in 7 gg', n('likes_7d'), pct(n('likes_7d'), n('views_7d'))],
              ['Click ai negozi oggi', n('clicks_today')],
              ['Click in 7 gg', n('clicks_7d'), `${pct(n('clicks_7d'), n('views_7d'))} dei visti`],
            ],
          ],
          [
            'Da sistemare',
            [
              ['Errori app', n('errors_open')],
              ['Segnalazioni', n('feedback_open')],
              ['Prodotti segnalati', n('reports_open')],
            ],
          ],
        ] as [string, [string, number | string, string?][]][])),
  ]
  return (
    <div className="space-y-3">
      {groups.map(([title, tiles]) => (
        <div key={title}>
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-neutral-500 uppercase">{title}</h3>
          <div className="grid grid-cols-3 gap-1.5 text-center sm:grid-cols-4">
            {tiles.map(([label, value, hint]) => (
              <div key={label} className="rounded-xl bg-neutral-50 px-1 py-1.5 leading-tight">
                <div className="text-base font-bold">{typeof value === 'number' ? value.toLocaleString('it-IT') : value}</div>
                <div className="mt-0.5 text-[11px] text-neutral-600">{label}</div>
                {hint && <div className="text-[10px] text-neutral-400">{hint}</div>}
              </div>
            ))}
          </div>
        </div>
      ))}
      {missing && <p className="text-xs text-neutral-500">Per vedere tutti i numeri esegui supabase/schema-18.sql in Supabase.</p>}
    </div>
  )
}

/** I numeri di questo telefono (statistiche anonime salvate qui), prima stavano nel Profilo. */
export function PhoneStats() {
  const { allProducts } = useApp()
  const consent = useConsent()
  const stats = consent === 'granted' ? summary() : null
  const titleOf = (id: string) => allProducts.find((p) => p.id === id)?.title ?? id
  if (!stats) return <p className="text-sm text-neutral-600">Attiva le statistiche anonime nel Profilo (Privacy) per vedere i numeri di questo telefono.</p>
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        <PhoneStat label="Visti" value={stats.views} />
        <PhoneStat label="Mi piace" value={stats.likes} />
        <PhoneStat label="No" value={stats.dislikes} />
        <PhoneStat label="Click negozio" value={stats.clicks} />
      </div>
      <p className="text-neutral-600">
        Click / visualizzazioni: <strong>{(stats.ctr * 100).toFixed(1)}%</strong>
      </p>
      {stats.topCategories.length > 0 && (
        <TopList title="Categorie preferite" rows={stats.topCategories.map(([id, n]) => [isCategoryId(id) ? categoryLabel(id) : id, n])} />
      )}
      {stats.topProducts.length > 0 && <TopList title="Prodotti più interessanti" rows={stats.topProducts.map(([id, n]) => [titleOf(id), n])} />}
    </div>
  )
}

function PhoneStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-neutral-50 py-2">
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  )
}

function TopList({ title, rows }: { title: string; rows: [string, number][] }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold tracking-wide text-neutral-500 uppercase">{title}</h3>
      <ol className="space-y-1">
        {rows.map(([name, n]) => (
          <li key={name} className="flex justify-between gap-3">
            <span className="truncate">{name}</span>
            <span className="text-neutral-500">{n}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
