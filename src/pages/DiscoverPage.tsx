import { RefreshCw, SlidersHorizontal, Sparkles } from 'lucide-react'
import { SwipeDeck } from '../components/SwipeDeck'
import { DeckTabs } from '../components/DeckTabs'
import { NewArrivals } from '../components/NewArrivals'
import { routeHref } from '../lib/useHashRoute'
import { widenSuggestions } from '../lib/widen'
import { useMemo } from 'react'
import { useApp } from '../state/AppState'

export function DiscoverPage() {
  const { state, deck, products, wishlist, actions } = useApp()
  const { catalog } = state
  // Mazzo finito: proposte per allargare i filtri, con quanti prodotti nuovi si vedrebbero.
  const widen = useMemo(() => {
    if (deck.length > 0 || products.length === 0) return []
    const seen = new Set([...state.disliked, ...wishlist.map((w) => w.product.id)])
    return widenSuggestions(state.filters, products.filter((p) => p.availability !== 'out_of_stock' && !seen.has(p.id)))
  }, [deck.length, products, state.disliked, state.filters, wishlist])

  // Anche quando la sezione aperta non è ancora arrivata (si scarica dopo l'altra).
  if (catalog.status === 'loading' || (catalog.status === 'ready' && !catalog.sections.includes(state.mode))) {
    return (
      <div className="flex flex-1 flex-col gap-4" aria-busy="true" aria-label="Caricamento prodotti">
        <div className="flex-1 animate-pulse rounded-3xl bg-neutral-200/70" />
        <div className="mx-auto h-14 w-64 animate-pulse rounded-full bg-neutral-200/70" />
      </div>
    )
  }

  if (catalog.status === 'error') {
    return (
      <Empty title="Non riusciamo a caricare i prodotti" text={catalog.error}>
        <button type="button" onClick={actions.reloadCatalog} className={primaryBtn}>
          <RefreshCw className="size-4" /> Riprova
        </button>
      </Empty>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {catalog.exploreMode && (
        <p className="rounded-2xl bg-amber-50 px-4 py-2 text-center text-xs text-amber-900 ring-1 ring-amber-200">
          Catalogo in preparazione: per ora ogni card apre una ricerca reale su Amazon.
        </p>
      )}
      <DeckTabs />
      {deck.length > 0 ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <SwipeDeck />
          <NewArrivals key={state.mode} />
        </div>
      ) : products.length === 0 ? (
        <Empty title="Sezione in arrivo" text="Stiamo preparando i prodotti di questa sezione: torna tra qualche ora.">
          <button type="button" onClick={() => actions.setMode('moda')} className={primaryBtn}>
            Torna alla moda
          </button>
        </Empty>
      ) : (
        <Empty title="Hai visto tutto!" text="Non ci sono altri prodotti con questi filtri.">
          {widen.map((w) => (
            <button key={w.label} type="button" onClick={() => actions.setFilters({ ...state.filters, ...w.patch })} className={primaryBtn}>
              {w.label} <span className="font-normal opacity-70">+{w.count.toLocaleString('it-IT')}</span>
            </button>
          ))}
          <a href={routeHref('filtri')} className={widen.length ? secondaryBtn : primaryBtn}>
            <SlidersHorizontal className="size-4" /> Modifica i filtri
          </a>
          {state.disliked.length > 0 && (
            <button type="button" onClick={actions.resetSeen} className={secondaryBtn}>
              <Sparkles className="size-4" /> Rivedi i {state.disliked.length} scartati
            </button>
          )}
        </Empty>
      )}
    </div>
  )
}

const primaryBtn =
  'inline-flex items-center justify-center gap-2 rounded-full bg-neutral-900 px-5 py-3 font-semibold text-white active:scale-95'
const secondaryBtn =
  'inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 font-semibold text-neutral-800 ring-1 ring-neutral-200 active:scale-95'

function Empty({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-5xl" aria-hidden>
        🛍️
      </div>
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="text-neutral-500">{text}</p>
      <div className="mt-2 flex flex-col gap-2">{children}</div>
    </div>
  )
}
