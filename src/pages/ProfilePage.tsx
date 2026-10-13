import { BadgeCheck, Users, BarChart3, Clapperboard, ChevronRight, Gamepad2, RotateCcw, ShieldCheck, Trash2, Undo2, UserRound } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { subscribeUnseen } from '../lib/social'
import { AccountActions, AccountCard } from '../components/AccountCard'
import { InstallCard } from '../components/InstallCard'
import { MyProfileCard } from '../components/MyProfileCard'
import { CrashLogCard } from '../components/CrashLogCard'
import { ProblemReport, ProblemReportIcon } from '../components/ProblemReport'
import { ADMIN_EMAIL, AMAZON_DISCLOSURE, APP_NAME, GENERIC_DISCLOSURE } from '../config/app'
import { categoryLabel, isCategoryId } from '../config/categories'
import { setConsent, summary } from '../lib/analytics'
import { load, remove, save } from '../lib/storage'
import { useConsent } from '../lib/useConsent'
import { toggleFollow, useFollows } from '../lib/follows'
import { routeHref } from '../lib/useHashRoute'
import { useApp } from '../state/AppState'
import { useAuth } from '../state/AuthState'

export function ProfilePage() {
  const { state, wishlist, allProducts: products, actions } = useApp()
  const consent = useConsent()
  const follows = useFollows()
  const { user } = useAuth()
  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL
  const [confirmClear, setConfirmClear] = useState(false)
  const [games, setGames] = useState(() => !load<boolean>('gamesOff', false))
  const stats = isAdmin && consent === 'granted' ? summary() : null
  const titleOf = (id: string) => products.find((p) => p.id === id)?.title ?? id

  const reset = confirmClear ? (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>Svuotare preferiti, scartati e filtri? L'account resta.</span>
      <button
        type="button"
        onClick={() => {
          actions.clearAll()
          setConsent('unset')
          remove('onboarded')
          setConfirmClear(false)
        }}
        className="rounded-full bg-rose-600 px-3 py-1 font-semibold text-[#fff]"
      >
        Sì, ricomincia
      </button>
      <button type="button" onClick={() => setConfirmClear(false)} className="px-2 py-1 font-medium text-neutral-500">
        Annulla
      </button>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => setConfirmClear(true)}
      className="inline-flex items-center gap-2 text-left text-sm font-medium text-rose-600"
    >
      <RotateCcw className="size-4" />
      <span>
        Ricomincia da zero
        <span className="block text-xs font-normal text-neutral-500">Svuota preferiti, scartati e filtri. L'account resta.</span>
      </span>
    </button>
  )

  return (
    <div className="space-y-5 pb-6">
      <h1 className="text-2xl font-bold">Profilo</h1>

      <MyProfileCard />
      <FriendsLink />

      {isAdmin && (
        <a
          href={routeHref('admin')}
          className="flex items-center justify-between rounded-2xl bg-neutral-900 p-4 font-semibold text-white shadow-sm"
        >
          <span className="flex items-center gap-2">
            <BarChart3 className="size-5" /> Statistiche dell'app
          </span>
          <ChevronRight className="size-5" />
        </a>
      )}
      {isAdmin && (
        <a
          href={routeHref('studio')}
          className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-rose-500 to-indigo-500 p-4 font-semibold text-[#fff] shadow-sm"
        >
          <span className="flex items-center gap-2">
            <Clapperboard className="size-5" /> Studio: video per Instagram e TikTok
          </span>
          <ChevronRight className="size-5" />
        </a>
      )}

      {isAdmin && <CrashLogCard />}

      <InstallCard />

      <Card icon={<UserRound className="size-5" />} title="Il tuo account">
        <AccountCard>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            <Stat label="Preferiti" value={wishlist.length} />
            <Stat label="Scartati" value={state.disliked.length} />
          </div>
          {state.disliked.length > 0 && (
            <a
              href={routeHref('scopri')}
              onClick={actions.resetSeen}
              className="mt-3 flex items-center justify-center gap-2 rounded-full bg-rose-500 px-4 py-3 text-sm font-semibold text-[#fff] active:scale-95"
            >
              <Undo2 className="size-4" /> {state.disliked.length === 1 ? 'Rivedi il prodotto scartato' : `Rivedi i ${state.disliked.length.toLocaleString('it-IT')} prodotti scartati`}
            </a>
          )}
        </AccountCard>
      </Card>

      <Card icon={<BadgeCheck className="size-5" />} title="Marche che segui">
        {follows.length === 0 ? (
          <p className="text-sm text-neutral-600">
            Apri un prodotto e tocca <strong>Segui</strong> sulla sua marca: le sue novità usciranno più spesso e, con le notifiche attive, ti avvisiamo quando ne arrivano di nuove.
          </p>
        ) : (
          <>
            <p className="mb-3 text-xs text-neutral-500">Tocca una marca per non seguirla più.</p>
            <div className="flex flex-wrap gap-2">
              {follows.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => toggleFollow(b)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-neutral-100 px-3.5 text-sm font-medium text-neutral-800"
                >
                  {b} <span aria-hidden className="text-neutral-400">✕</span>
                  <span className="sr-only">non seguire più</span>
                </button>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card icon={<Gamepad2 className="size-5" />} title="Mini giochi">
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>
            Giochi tra uno swipe e l'altro
            <span className="block text-xs text-neutral-500">Indovina il prezzo, Cosa ti va, la Ruota della fortuna e gli altri, ogni 10 swipe.</span>
          </span>
          <input
            type="checkbox"
            checked={games}
            onChange={(e) => {
              setGames(e.target.checked)
              save('gamesOff', !e.target.checked)
            }}
            className="size-5 accent-neutral-900"
          />
        </label>
      </Card>

      {/* Le statistiche personali le vede solo l'amministratore. */}
      {isAdmin && (
        <Card icon={<BarChart3 className="size-5" />} title="Statistiche">
          {stats ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                <Stat label="Visti" value={stats.views} />
                <Stat label="Mi piace" value={stats.likes} />
                <Stat label="No" value={stats.dislikes} />
                <Stat label="Click negozio" value={stats.clicks} />
              </div>
              <p className="text-neutral-600">
                Click / visualizzazioni: <strong>{(stats.ctr * 100).toFixed(1)}%</strong>
              </p>
              {stats.topCategories.length > 0 && (
                <TopList
                  title="Categorie preferite"
                  rows={stats.topCategories.map(([id, n]) => [isCategoryId(id) ? categoryLabel(id) : id, n])}
                />
              )}
              {stats.topProducts.length > 0 && (
                <TopList title="Prodotti più interessanti" rows={stats.topProducts.map(([id, n]) => [titleOf(id), n])} />
              )}
            </div>
          ) : (
            <p className="text-sm text-neutral-600">Attiva le statistiche anonime qui sotto per vedere i tuoi numeri.</p>
          )}
        </Card>
      )}

      <Card icon={<ProblemReportIcon className="size-5" />} title="Segnala un problema">
        <ProblemReport />
      </Card>

      <Card icon={<ShieldCheck className="size-5" />} title="Privacy">
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>
            Statistiche anonime di utilizzo
            <span className="block text-xs text-neutral-500">Anonime, senza cookie di terze parti: ci aiutano a capire cosa piace.</span>
          </span>
          <input
            type="checkbox"
            checked={consent === 'granted'}
            onChange={(e) => setConsent(e.target.checked ? 'granted' : 'denied')}
            className="size-5 accent-neutral-900"
          />
        </label>
        <p className="mt-3 text-xs text-neutral-500">
          {GENERIC_DISCLOSURE} {AMAZON_DISCLOSURE}
        </p>
        <a href={routeHref('privacy')} className="mt-3 inline-block text-sm font-medium text-rose-600 underline">
          Informativa privacy e termini
        </a>
      </Card>

      <Card icon={<Trash2 className="size-5" />} title={user ? "Account e dati" : "Dati"}>
        <div className="flex flex-col gap-2">
          {user ? <AccountActions>{reset}</AccountActions> : reset}
        </div>
      </Card>

      <p className="text-center text-xs text-neutral-400">
        <a href="./moda/" className="underline">Sfoglia categorie e marche</a> · {APP_NAME} · versione {__APP_VERSION__}
      </p>
    </div>
  )
}

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <h2 className="mb-2 flex items-center gap-2 font-semibold">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
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

/** Ingresso agli Amici (prima era una scheda della barra in basso): amici, consigli ricevuti, Swipe insieme. */
function FriendsLink() {
  const [unseen, setUnseen] = useState(0)
  useEffect(() => subscribeUnseen(setUnseen), [])
  return (
    <a href={routeHref('amici')} className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <span className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-rose-50 text-rose-500">
          <Users className="size-5" />
        </span>
        <span>
          <span className="block font-semibold">Amici</span>
          <span className="block text-xs text-neutral-500">Consigli, sondaggi e Swipe insieme</span>
        </span>
      </span>
      <span className="flex items-center gap-2">
        {unseen > 0 && (
          <span className="min-w-5 rounded-full bg-rose-500 px-1.5 text-center text-[10px] leading-5 font-bold text-[#fff]">{unseen > 99 ? '99+' : unseen}</span>
        )}
        <ChevronRight className="size-5 text-neutral-400" />
      </span>
    </a>
  )
}
