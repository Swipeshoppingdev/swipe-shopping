import { SIZE_HINT, SizePicker } from '../components/SizePicker'
import { Check, X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { NO_CATEGORY, categoryIdsOf, groupsOf, sectionOf, type CategoryId } from '../config/categories'
import { colorSwatch } from '../config/colors'
import { BrandPicker } from '../components/BrandPicker'
import { PriceRange } from '../components/PriceRange'
import { STORES, type StoreId } from '../config/stores'
import { activeFilterCount, facetValues, matchesFilters } from '../lib/filters'
import { STYLES, warmStyles } from '../lib/styles'
import { routeHref } from '../lib/useHashRoute'
import { useApp } from '../state/AppState'
import { DEFAULT_FILTERS, type Filters } from '../types/product'

/** "Escludi tutto" per marche e colori: nessun prodotto ha questo valore, quindi tutto è rosso. */
const NONE = 'nessuno'
const STYLE_IDS: string[] = STYLES.map((s) => s.id)

/** Verde/rosso: lista vuota = tutto incluso (tutto verde). */
const isIn = <T,>(list: T[], value: T) => list.length === 0 || list.includes(value)

/** Passa un valore da verde a rosso o viceversa; tutto verde torna a lista vuota. */
function flip<T>(list: T[], value: T, all: T[]): T[] {
  const base = list.length === 0 ? all : list.filter((v) => all.includes(v))
  const next = base.includes(value) ? base.filter((v) => v !== value) : [...base, value]
  return next.length >= all.length ? [] : next
}

export function FiltersPage() {
  const { state, products, actions } = useApp()
  const f = state.filters
  const set = (patch: Partial<Filters>) => actions.setFilters({ ...f, ...patch })
  const moda = state.mode === 'moda'
  useEffect(() => (moda ? warmStyles(products) : undefined), [moda, products])
  // Genere e colore solo nelle sezioni che li hanno (vedi SECTIONS).
  const section = sectionOf(state.mode)
  const facets = facetValues(products)
  const matching = products.filter((p) => p.availability !== 'out_of_stock' && matchesFilters(p, f)).length
  // Come per le marche: nessuna selezionata (o tutte) = tutte le categorie.
  const allCategories = categoryIdsOf(state.mode)
  const setCategories = (list: CategoryId[]) => {
    const real = list.filter((c) => c !== NO_CATEGORY)
    // Tutte spente = "Deseleziona tutto"; tutte accese = nessun filtro.
    set({ categories: real.length === 0 ? (list.length ? [NO_CATEGORY] : []) : real.length >= allCategories.length ? [] : real })
  }
  const flipCategory = (id: CategoryId) => {
    const base = f.categories.includes(NO_CATEGORY) ? [] : f.categories.length === 0 ? allCategories : f.categories
    const next = base.includes(id) ? base.filter((c) => c !== id) : [...base, id]
    setCategories(next.length ? next : [NO_CATEGORY])
  }
  const categoryIn = (id: CategoryId) => !f.categories.includes(NO_CATEGORY) && isIn(f.categories, id)
  // Negozi e colori: almeno uno resta verde (tutti rossi non mostrerebbe niente).
  const flipKeepOne = <T,>(list: T[], value: T, all: T[]) => {
    const next = flip(list, value, all)
    return next.length === 0 && list.length === 1 && list[0] === value ? list : next
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Filtri{state.mode === 'moda' ? '' : ` ${section.label}`}</h1>
        {activeFilterCount(f) > 0 && (
          <button type="button" onClick={() => actions.setFilters(DEFAULT_FILTERS)} className="rounded-full bg-rose-600 px-4 py-1.5 text-sm font-semibold text-[#fff] shadow-sm active:scale-95">
            Azzera filtri
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl bg-white p-3 text-sm ring-1 ring-neutral-200">
        <span className="text-neutral-600">Nella home vedi solo i prodotti verdi.</span>
        <span className="inline-flex items-center gap-1 rounded-full chip-in px-2.5 py-0.5 font-medium ring-1">
          <Check className="size-3.5" /> incluso
        </span>
        <span className="inline-flex items-center gap-1 rounded-full chip-out px-2.5 py-0.5 font-medium ring-1">
          <X className="size-3.5" /> escluso
        </span>
        <span className="text-neutral-600">Tocca un filtro per cambiarlo.</span>
      </div>

      {matching === 0 && products.length > 0 && (
        <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">Nessun prodotto con questi filtri: prova ad allargarli.</p>
      )}

      {section.gender && (
        <Section title="Genere">
          <div className="grid grid-cols-3 gap-1 rounded-2xl bg-neutral-100 p-1">
            {(
              [
                ['tutti', 'Tutti'],
                ['donna', 'Donna'],
                ['uomo', 'Uomo'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => set({ gender: value })}
                aria-pressed={f.gender === value}
                className={`rounded-xl py-2 text-sm font-semibold transition ${f.gender === value ? 'bg-white shadow-sm' : 'text-neutral-500'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </Section>
      )}

      {facets.stores.length > 1 && (
        <Section title="Negozi">
          <div className="flex flex-wrap gap-2">
            {facets.stores.map((id) => (
              <Chip key={id} active={isIn(f.stores, id)} onClick={() => set({ stores: flipKeepOne(f.stores, id, facets.stores as StoreId[]) })}>
                {STORES[id].name}
              </Chip>
            ))}
          </div>
        </Section>
      )}

      {state.mode === 'moda' && (
        <Section
          title="Stile"
          actions={
            <AllNone
              all={!f.styles?.length}
              none={!!f.styles?.includes(NONE)}
              onAll={() => set({ styles: [] })}
              onNone={() => set({ styles: [NONE] })}
            />
          }
        >
          <div className="flex flex-wrap gap-2">
            {STYLES.map(({ id, label }) => (
              <Chip key={id} active={isIn(f.styles ?? [], id)} onClick={() => set({ styles: flipKeepOne(f.styles ?? [], id, STYLE_IDS) })}>
                {label}
              </Chip>
            ))}
          </div>
        </Section>
      )}

      <Section title="Prezzo" hint="Con un limite di prezzo vedi solo prodotti con prezzo aggiornato">
        <PriceRange min={f.priceMin} max={f.priceMax} onChange={(priceMin, priceMax) => set({ priceMin, priceMax })} />
      </Section>

      <Section title="Categorie">
        <div className="space-y-4">
          {groupsOf(state.mode).map((group) => {
            const ids = group.items.map((i) => i.id) as CategoryId[]
            const all = ids.every(categoryIn)
            const none = !ids.some(categoryIn)
            const current = f.categories.includes(NO_CATEGORY) ? [] : f.categories.length === 0 ? allCategories : f.categories
            return (
              <div key={group.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold">
                    <span aria-hidden>{group.emoji}</span> {group.label}
                  </p>
                  {/* Includi/escludi tutto il gruppo (es. tutte le scarpe) */}
                  <AllNone
                    all={all}
                    none={none}
                    onAll={() => setCategories([...new Set([...current, ...ids])])}
                    onNone={() => {
                      const rest = current.filter((c) => !ids.includes(c))
                      setCategories(rest.length ? rest : [NO_CATEGORY])
                    }}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.items.map((item) => (
                    <Chip
                      key={item.id}
                      active={categoryIn(item.id as CategoryId)}
                      onClick={() => flipCategory(item.id as CategoryId)}
                    >
                      {item.label}
                    </Chip>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </Section>

      {facets.brands.length > 0 && (
        <Section
          title="Marca"
          actions={
            <AllNone
              all={f.brands.length === 0}
              none={f.brands.includes(NONE)}
              onAll={() => set({ brands: [] })}
              onNone={() => set({ brands: [NONE] })}
            />
          }
        >
          <BrandPicker
            brands={facets.brands}
            selected={f.brands}
            onToggle={(v) => set({ brands: flipKeepOne(f.brands, v, facets.brands) })}
          />
        </Section>
      )}
      {facets.sizes.length > 0 && (
        <Section title="La tua taglia" hint={SIZE_HINT}>
          <SizePicker values={facets.sizes} selected={f.sizes} onChange={(sizes) => set({ sizes })} />
        </Section>
      )}
      {section.colors && facets.colors.length > 0 && (
        <Section
          title="Colore"
          actions={
            <AllNone
              all={f.colors.length === 0}
              none={f.colors.includes(NONE)}
              onAll={() => set({ colors: [] })}
              onNone={() => set({ colors: [NONE] })}
            />
          }
        >
          <div className="flex flex-wrap gap-2">
            {facets.colors.map((c) => (
              <Chip key={c} active={isIn(f.colors, c)} onClick={() => set({ colors: flipKeepOne(f.colors, c, facets.colors) })}>
                {colorSwatch(c) && (
                  <span
                    aria-hidden
                    className="size-3.5 rounded-full ring-1 ring-black/15"
                    style={{ background: colorSwatch(c) }}
                  />
                )}
                {c}
              </Chip>
            ))}
          </div>
        </Section>
      )}


      {/* I filtri si applicano subito: il pulsante serve a far capire che si torna ai prodotti. */}
      <div className="pointer-events-none sticky bottom-3 flex justify-center">
        <a
          href={routeHref('scopri')}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-rose-500 px-5 py-2.5 text-sm font-semibold text-[#fff] shadow-lg active:scale-95"
        >
          <Check className="size-4" /> Applica filtri
          <span className="font-normal opacity-80">({matching.toLocaleString('it-IT')})</span>
        </a>
      </div>
    </div>
  )
}

function Section({ title, hint, actions, children }: { title: string; hint?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <h2 className="font-semibold">{title}</h2>
          {hint && <p className="text-xs text-neutral-500">{hint}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

/** Pulsanti verde/rosso "Includi tutto" e "Escludi tutto" per un gruppo di filtri. */
export function AllNone({ all, none, onAll, onNone }: { all: boolean; none: boolean; onAll: () => void; onNone: () => void }) {
  return (
    <>
      <button
        type="button"
        onClick={onAll}
        disabled={all}
        className="shrink-0 rounded-full chip-in px-2.5 py-1 text-xs whitespace-nowrap font-semibold ring-1 active:scale-95 disabled:opacity-40"
      >
        Includi tutto
      </button>
      <button
        type="button"
        onClick={onNone}
        disabled={none}
        className="shrink-0 rounded-full chip-out px-2.5 py-1 text-xs whitespace-nowrap font-semibold ring-1 active:scale-95 disabled:opacity-40"
      >
        Escludi tutto
      </button>
    </>
  )
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      // Verde = incluso nella ricerca, rosso = escluso. Colori fissi, uguali in tema chiaro e scuro.
      className={`inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition active:scale-95 ${
        active ? 'chip-in' : 'chip-out'
      }`}
    >
      {active ? <Check className="size-3.5" /> : <X className="size-3.5" />}
      {children}
    </button>
  )
}
