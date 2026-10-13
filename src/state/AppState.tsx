import { useBoost } from '../lib/boost'
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { UNIVERSES, isUniverse, universeOf, type Universe } from '../config/categories'
import { track } from '../lib/analytics'
import { loadCatalog, loadCatalogPreview } from '../lib/catalog'
import { fetchUserData, mergeUserData, saveUserData } from '../lib/cloudSync'
import { matchesFilters, normalizeFilters, sortProducts } from '../lib/filters'
import { isNew, setNewBaseline } from '../lib/newness'
import { fitSizes } from '../lib/sizes'
import { isFollowed, useFollows } from '../lib/follows'
import { modelKey } from '../lib/dedupe'
import { discountBadge } from '../lib/price'
import { sharedProductId } from '../lib/share'
import { load, save } from '../lib/storage'
import { DEFAULT_FILTERS, type Filters, type Product } from '../types/product'
import { useAuth } from './AuthState'

export interface WishItem {
  /** Copia del prodotto al momento del salvataggio: resta visibile anche se esce dal catalogo */
  product: Product
  savedAt: number
  /** Cartella dei preferiti (nessuna = solo in "Tutti") */
  folder?: string
}

type CatalogState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; products: Product[]; exploreMode: boolean; sections: Universe[] }

interface State {
  catalog: CatalogState
  /** Sezione aperta: moda (principale) o una delle altre (vedi SECTIONS) */
  mode: Universe
  /** Filtri della moda (sincronizzati con l'account) */
  filters: Filters
  /** Filtri delle altre sezioni (solo su questo dispositivo) */
  sectionFilters: Record<OtherSection, Filters>
  wishlist: WishItem[]
  disliked: string[]
  /** Ultimi swipe, per annullarli uno alla volta (il più recente in fondo) */
  history: { type: 'like' | 'dislike'; product: Product }[]
  /** Swipe fatti in questa visita (non si azzera con l'undo né col limite della cronologia): ritmo dei giochi */
  swipes: number
  /** Scartati rimessi nel mazzo: tornano in cima, il più recente per primo */
  restored: string[]
}

type Action =
  | { type: 'catalog'; catalog: CatalogState }
  | { type: 'like' | 'dislike'; product: Product }
  | { type: 'undo' }
  | { type: 'restore'; ids: string[] }
  | { type: 'pin'; ids: string[] }
  | { type: 'remove'; id: string }
  | { type: 'filters'; filters: Filters; section?: Universe }
  | { type: 'mode'; mode: Universe }
  | { type: 'resetSeen' }
  | { type: 'clearAll' }
  | { type: 'hydrate'; wishlist: WishItem[]; disliked: string[]; filters: Filters }
  | { type: 'folder'; id: string; folder?: string }
  | { type: 'renameFolder'; from: string; to?: string }

/** Mette un prodotto delle marche seguite ogni 3 carte (nella seconda posizione di ogni terna). */
function interleaveFollowed(list: Product[], follows: string[]) {
  const fav = list.filter((p) => isFollowed(p.brand, follows))
  if (fav.length === 0) return list
  const others = list.filter((p) => !isFollowed(p.brand, follows))
  const out: Product[] = []
  let f = 0
  let o = 0
  while (f < fav.length || o < others.length) {
    if (out.length % 3 === 1 && f < fav.length) out.push(fav[f++])
    else if (o < others.length) out.push(others[o++])
    else out.push(fav[f++])
  }
  return out
}

/** Carte del mazzo preparate a ogni swipe (le altre arrivano man mano) */
const DECK_WINDOW = 400
const BOOST_EXTRA = 40
const FOLLOW_EXTRA = 80
const MAX_DISLIKED = 5000
const MAX_HISTORY = 30
/** No di fila (senza Sì) in una categoria, negli ultimi MAX_HISTORY swipe, perché vada in fondo al mazzo */
const TIRED_AFTER = 6
/** Dopo quanto si scaricano le altre sezioni (ms) */
const REST_DELAY_MS = 3000

type OtherSection = Exclude<Universe, 'moda'>

/** Filtri di ogni sezione tranne la moda (salvati come techFilters, gadgetFilters…). */
const otherSectionFilters = (make: (u: OtherSection) => Filters) =>
  Object.fromEntries(UNIVERSES.filter((u) => u !== 'moda').map((u) => [u, make(u as OtherSection)])) as Record<OtherSection, Filters>

/** ?sezione=tech arriva dalle pagine Google ("Apri l'app"); altrimenti l'ultima sezione aperta. */
function initialMode(): Universe {
  const fromUrl = new URLSearchParams(window.location.search).get('sezione')
  if (isUniverse(fromUrl)) {
    // Usato una volta: poi vale la sezione scelta dall'utente, anche ricaricando.
    window.history.replaceState(null, '', window.location.pathname + window.location.hash)
    save('mode', fromUrl)
    return fromUrl
  }
  const saved = load<string>('mode', 'moda')
  return isUniverse(saved) ? saved : 'moda'
}

/** Copia salvata nei preferiti senza prezzi: i prezzi si leggono sempre dal catalogo aggiornato. */
const snapshot = ({ price: _p, originalPrice: _o, priceCheckedAt: _c, priceFrom: _f, ...rest }: Product): Product => rest
const stripPrices = (list: WishItem[]) => list.map((w) => ({ ...w, product: snapshot(w.product) }))

/** Seme personale per l'ordine "Consigliati": stabile tra una visita e l'altra. */
const MIX_SEED = (() => {
  const existing = load<string>('mixSeed', '')
  if (existing) return existing
  const seed = Math.random().toString(36).slice(2)
  save('mixSeed', seed)
  return seed
})()

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'catalog':
      return { ...state, catalog: action.catalog }
    case 'like':
      if (state.wishlist.some((w) => w.product.id === action.product.id)) return state
      return {
        ...state,
        wishlist: [{ product: snapshot(action.product), savedAt: Date.now() }, ...state.wishlist],
        history: [...state.history, { type: 'like' as const, product: action.product }].slice(-MAX_HISTORY),
        swipes: state.swipes + 1,
      }
    case 'dislike':
      return {
        ...state,
        disliked: [...state.disliked, action.product.id].slice(-MAX_DISLIKED),
        history: [...state.history, { type: 'dislike' as const, product: action.product }].slice(-MAX_HISTORY),
        swipes: state.swipes + 1,
      }
    case 'undo': {
      const last = state.history.at(-1)
      if (!last) return state
      return {
        ...state,
        wishlist: last.type === 'like' ? state.wishlist.filter((w) => w.product.id !== last.product.id) : state.wishlist,
        disliked: last.type === 'dislike' ? state.disliked.filter((id) => id !== last.product.id) : state.disliked,
        history: state.history.slice(0, -1),
        restored: [last.product.id, ...state.restored.filter((id) => id !== last.product.id)],
      }
    }
    // Le carte già sullo schermo restano in cima quando arriva il catalogo completo.
    case 'pin': {
      const ids = new Set(action.ids)
      return { ...state, restored: [...action.ids, ...state.restored.filter((id) => !ids.has(id))] }
    }
    case 'restore': {
      const ids = new Set(action.ids)
      return {
        ...state,
        disliked: state.disliked.filter((id) => !ids.has(id)),
        history: state.history.filter((h) => !(h.type === 'dislike' && ids.has(h.product.id))),
        // Il più recente torna per primo.
        restored: [...action.ids].reverse().concat(state.restored.filter((id) => !ids.has(id))),
      }
    }
    case 'remove':
      return { ...state, wishlist: state.wishlist.filter((w) => w.product.id !== action.id), history: state.history.filter((h) => h.product.id !== action.id) }
    case 'filters': {
      const section = action.section ?? state.mode
      return section === 'moda'
        ? { ...state, filters: normalizeFilters(action.filters) }
        : { ...state, sectionFilters: { ...state.sectionFilters, [section]: normalizeFilters(action.filters) } }
    }
    case 'mode':
      return { ...state, mode: action.mode, history: [], restored: [] }
    case 'resetSeen':
      return { ...state, disliked: [], history: [], restored: [] }
    case 'clearAll':
      return { ...state, wishlist: [], disliked: [], filters: DEFAULT_FILTERS, sectionFilters: otherSectionFilters(() => DEFAULT_FILTERS), history: [], restored: [] }
    case 'folder':
      return {
        ...state,
        wishlist: state.wishlist.map((w) => (w.product.id === action.id ? { ...w, folder: action.folder } : w)),
      }
    case 'renameFolder':
      return {
        ...state,
        wishlist: state.wishlist.map((w) => (w.folder === action.from ? { ...w, folder: action.to } : w)),
      }
    case 'hydrate':
      return {
        ...state,
        wishlist: stripPrices(action.wishlist),
        disliked: action.disliked.slice(-MAX_DISLIKED),
        filters: normalizeFilters({ ...DEFAULT_FILTERS, ...action.filters }),
        history: [],
        restored: [],
      }
  }
}

function useAppStore() {
  const [state, dispatch] = useReducer(reducer, undefined, (): State => ({
    catalog: { status: 'loading' },
    mode: initialMode(),
    filters: normalizeFilters({ ...DEFAULT_FILTERS, ...load<Partial<Filters>>('filters:v2', {}) }),
    sectionFilters: otherSectionFilters((u) => normalizeFilters({ ...DEFAULT_FILTERS, ...load<Partial<Filters>>(`${u}Filters`, {}) })),
    wishlist: stripPrices(load<WishItem[]>('wishlist', [])),
    disliked: load<string[]>('disliked', []),
    history: [],
    swipes: 0,
    restored: [],
  }))

  useEffect(() => {
    save('filters:v2', state.filters)
  }, [state.filters])
  useEffect(() => {
    for (const [u, f] of Object.entries(state.sectionFilters)) save(`${u}Filters`, f)
  }, [state.sectionFilters])
  useEffect(() => {
    save('mode', state.mode)
    // Classe per i colori della sezione (vedi src/index.css).
    for (const u of UNIVERSES) if (u !== 'moda') document.documentElement.classList.toggle(u, state.mode === u)
  }, [state.mode])
  const activeFilters = state.mode === 'moda' ? state.filters : state.sectionFilters[state.mode]
  useEffect(() => {
    save('wishlist', state.wishlist)
  }, [state.wishlist])
  useEffect(() => {
    save('disliked', state.disliked)
  }, [state.disliked])

  const sync = useCloudSync(state, dispatch)

  // Prima la sezione aperta (si vede subito), poi le altre in sottofondo (preferiti, link condivisi, cambio sezione).
  const modeRef = useRef(state.mode)
  // Le altre sezioni si scaricano dopo, a mazzo già pronto (prima le foto delle prime card);
  // subito se si apre una sezione che manca.
  const wakeRest = useRef<(() => void) | null>(null)
  useEffect(() => {
    modeRef.current = state.mode
    if (state.catalog.status === 'ready' && !state.catalog.sections.includes(state.mode)) wakeRest.current?.()
  }, [state.mode, state.catalog])
  // Anteprima: poche centinaia di prodotti della sezione (file piccolo) per mostrare subito le prime carte,
  // mentre il catalogo completo finisce di scaricarsi. Poi le carte già sullo schermo restano in cima.
  const [preview, setPreview] = useState<Product[] | null>(null)
  const deckRef = useRef<Product[]>([])
  const previewShown = useRef(false)
  const reloadCatalog = useCallback((signal?: AbortSignal) => {
    dispatch({ type: 'catalog', catalog: { status: 'loading' } })
    const first = modeRef.current
    let full = false
    loadCatalogPreview(first, signal)
      .then((p) => {
        if (!full && !signal?.aborted && p.length) setPreview(p)
      })
      .catch(() => {})
    loadCatalog(first, signal)
      .then(async (r) => {
        full = true
        if (previewShown.current) dispatch({ type: 'pin', ids: deckRef.current.slice(0, 3).map((p) => p.id) })
        previewShown.current = false
        setPreview(null)
        setNewBaseline(r.products)
        dispatch({ type: 'catalog', catalog: { status: 'ready', products: r.products, exploreMode: r.exploreMode, sections: r.sections } })
        const others = UNIVERSES.filter((u) => !r.sections.includes(u))
        if (others.length === 0) return
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, REST_DELAY_MS)
          wakeRest.current = () => {
            clearTimeout(t)
            resolve()
          }
        })
        wakeRest.current = null
        if (signal?.aborted) return
        const rest = await Promise.all(others.map((u) => loadCatalog(u, signal).catch(() => null)))
        if (signal?.aborted) return
        const products = [...r.products, ...rest.flatMap((x) => x?.products ?? [])]
        setNewBaseline(products)
        dispatch({ type: 'catalog', catalog: { status: 'ready', products, exploreMode: false, sections: [...UNIVERSES] } })
      })
      .catch((e: unknown) => {
        if (signal?.aborted) return
        dispatch({ type: 'catalog', catalog: { status: 'error', error: e instanceof Error ? e.message : String(e) } })
      })
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    reloadCatalog(ctrl.signal)
    return () => ctrl.abort()
  }, [reloadCatalog])

  const products = useMemo(() => (state.catalog.status === 'ready' ? state.catalog.products : []), [state.catalog])
  // Il mazzo può partire dall'anteprima; tutto il resto (preferiti, giochi, offerte) aspetta il catalogo vero.
  const deckProducts = useMemo(
    () => (state.catalog.status === 'loading' && preview ? preview : products),
    [state.catalog.status, preview, products],
  )

  // Prodotto aperto da un link condiviso: va in cima al mazzo una volta sola, anche se filtrato o già visto.
  const [sharedId, setSharedId] = useState(() => sharedProductId())
  useEffect(() => {
    if (sharedId) window.history.replaceState(null, '', '#/scopri')
  }, [sharedId])
  // Link condiviso a un prodotto dell'altra sezione: si apre la sua sezione.
  const sharedProduct = sharedId ? products.find((p) => p.id === sharedId) : undefined
  useEffect(() => {
    if (sharedProduct) dispatch({ type: 'mode', mode: universeOf(sharedProduct.category) })
  }, [sharedProduct])

  const byId = useMemo(() => new Map(deckProducts.map((p) => [p.id, p])), [deckProducts])
  const boost = useBoost()
  // Solo la categoria (non i giri rimasti): il mazzo non si ricalcola a ogni swipe.
  const boostCat = boost && boost.section === state.mode ? boost.category : null
  // Categorie "stancanti": tanti No e nessun Sì negli ultimi swipe. Vanno in fondo al mazzo (non spariscono)
  // e tornano da sole quando quei No escono dagli ultimi 30 swipe: magari dopo si ha voglia d'altro.
  const tiredKey = useMemo(() => {
    const no = new Map<string, number>()
    const yes = new Set<string>()
    for (const h of state.history) {
      if (h.type === 'like') yes.add(h.product.category)
      else no.set(h.product.category, (no.get(h.product.category) ?? 0) + 1)
    }
    return [...no].filter(([c, n]) => n >= TIRED_AFTER && !yes.has(c)).map(([c]) => c).sort().join('|')
  }, [state.history])

  // Marche seguite: una carta su tre è di una di loro (finché ce ne sono), senza riempire il mazzo solo di quelle.
  const follows = useFollows()

  // Prodotti della sezione già filtrati e ordinati: si ricalcola solo quando cambiano catalogo, sezione o filtri,
  // non a ogni swipe (sui telefoni lenti rifare tutto su decine di migliaia di prodotti costava centinaia di ms).
  // Quando arrivano le altre sezioni i prodotti di questa restano gli stessi: si tiene la lista di prima
  // così il mazzo non si ricalcola (era il blocco più lungo dopo l'avvio).
  const modeProductsRef = useRef<Product[]>([])
  const modeProducts = useMemo(() => {
    const next = deckProducts.filter((p) => universeOf(p.category) === state.mode)
    const prev = modeProductsRef.current
    if (prev.length === next.length && next.every((p, i) => p === prev[i])) return prev
    modeProductsRef.current = next
    return next
  }, [deckProducts, state.mode])
  const sectionDeck = useMemo(() => {
    const list = modeProducts.filter((p) => p.availability !== 'out_of_stock' && matchesFilters(p, activeFilters))
    const mixed = sortProducts(list, activeFilters.sort, MIX_SEED)
    // I prodotti appena arrivati per primi (sempre mescolati), poi tutti gli altri.
    const fresh = new Set(mixed.filter((p) => isNew(p)))
    // Con "La tua taglia": prima i capi con la taglia confermata, poi le novità, poi il resto.
    const fit = new Set(activeFilters.sizes.length ? mixed.filter((p) => fitSizes(p.sizes, activeFilters.sizes).length) : [])
    const ordered = [...mixed.filter((p) => fit.has(p) && fresh.has(p)), ...mixed.filter((p) => fit.has(p) && !fresh.has(p)), ...mixed.filter((p) => !fit.has(p) && fresh.has(p)), ...mixed.filter((p) => !fit.has(p) && !fresh.has(p))]
    return { ordered, inList: new Set(list) }
  }, [modeProducts, activeFilters])

  const fullDeck = useMemo(() => {
    const seen = new Set([...state.disliked, ...state.wishlist.map((w) => w.product.id)])
    // Una variante per modello: niente stessa felpa in tre colori di fila. Un modello già scartato o salvato non torna.
    const seenModels = new Set([...seen].flatMap((id) => (byId.has(id) ? [modelKey(byId.get(id)!)] : [])))
    // Si prepara solo la parte alta del mazzo (DECK_WINDOW carte), più qualche carta della categoria scelta e delle
    // marche seguite: rifare tutto il catalogo a ogni swipe rallentava i telefoni lenti. Al prossimo swipe si ricalcola.
    const sorted: Product[] = []
    const extra: Product[] = []
    let boosted = 0
    let followed = 0
    const { ordered } = sectionDeck
    for (let i = 0; i < ordered.length; i++) {
      const full = sorted.length >= DECK_WINDOW
      if (full && (!boostCat || boosted >= BOOST_EXTRA) && (!follows.length || followed >= FOLLOW_EXTRA)) break
      const p = ordered[i]
      if (seen.has(p.id)) continue
      // Calcolata solo per le carte che si guardano davvero, non per tutto il catalogo.
      const model = modelKey(p)
      if (seenModels.has(model)) continue
      const isBoost = !!boostCat && p.category === boostCat
      const isFollow = follows.length > 0 && isFollowed(p.brand, follows)
      if (full && !(isBoost && boosted < BOOST_EXTRA) && !(isFollow && followed < FOLLOW_EXTRA)) continue
      seenModels.add(model)
      if (isBoost) boosted++
      if (isFollow) followed++
      ;(full ? extra : sorted).push(p)
    }
    if (extra.length) sorted.push(...extra)
    // Scartati rimessi nel mazzo: in cima (anche se il modello era già stato visto).
    const back = state.restored.flatMap((id) => {
      const p = byId.get(id)
      return p && sectionDeck.inList.has(p) && !seen.has(p.id) ? [p] : []
    })
    const rest0 = back.length ? sorted.filter((p) => !back.includes(p)) : sorted
    // "Cosa ti va?": la categoria scelta va in cima per un po'.
    const rest1 = boostCat ? [...rest0.filter((p) => p.category === boostCat), ...rest0.filter((p) => p.category !== boostCat)] : rest0
    const tired = new Set(tiredKey ? tiredKey.split('|') : [])
    const rest = tired.size ? [...rest1.filter((p) => !tired.has(p.category) || p.category === boostCat), ...rest1.filter((p) => tired.has(p.category) && p.category !== boostCat)] : rest1
    const withBack = [...back, ...(follows.length ? interleaveFollowed(rest, follows) : rest)]
    const shared = sharedId ? deckProducts.find((p) => p.id === sharedId) : undefined
    return shared ? [shared, ...withBack.filter((p) => p.id !== shared.id)] : withBack
  }, [deckProducts, byId, sectionDeck, state.disliked, state.wishlist, state.restored, sharedId, boostCat, tiredKey, follows])
  const deck = fullDeck
  // In anteprima si mostra il mazzo solo se ha abbastanza carte (altrimenti si aspetta il catalogo completo).
  const previewing = state.catalog.status === 'loading' && !!preview && deck.length >= 3
  deckRef.current = deck
  if (previewing) previewShown.current = true

  /** Gli scartati della sezione aperta, dal più vecchio al più recente */
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const sectionDisliked = useMemo(() => {
    const byId = productsById
    return state.disliked.filter((id) => {
      const p = byId.get(id)
      return !!p && universeOf(p.category) === state.mode
    })
  }, [productsById, state.disliked, state.mode])

  /** Preferiti con i dati aggiornati dal catalogo quando il prodotto è ancora presente */
  const wishlist = useMemo(() => {
    const byId = productsById
    return state.wishlist.map((w) => {
      const current = byId.get(w.product.id)
      return {
        ...w,
        product: current ?? w.product,
        inCatalog: !!current,
        /** Sconto attuale sul negozio (non confrontiamo con prezzi vecchi: Amazon non lo consente) */
        deal: current && current.availability !== 'out_of_stock' ? discountBadge(current) : null,
      }
    })
  }, [productsById, state.wishlist])

  /** Offerte sui preferiti già viste nella pagina Preferiti: id → sconto visto */
  const [seenDeals, setSeenDeals] = useState(() => load<Record<string, number>>('dealsSeen', {}))
  const unseenDeals = wishlist.filter((w) => w.deal !== null && seenDeals[w.product.id] !== w.deal).length
  const markDealsSeen = useCallback(() => {
    setSeenDeals((prev) => {
      const next: Record<string, number> = {}
      for (const w of wishlist) if (w.deal !== null) next[w.product.id] = w.deal
      if (Object.keys(next).every((id) => prev[id] === next[id]) && Object.keys(prev).length === Object.keys(next).length) return prev
      save('dealsSeen', next)
      return next
    })
  }, [wishlist])

  const actions = useMemo(
    () => ({
      like: (product: Product) => {
        setSharedId(null)
        track('like', product)
        dispatch({ type: 'like', product })
      },
      dislike: (product: Product) => {
        setSharedId(null)
        track('dislike', product)
        dispatch({ type: 'dislike', product })
      },
      undo: () => dispatch({ type: 'undo' }),
      /** Rimette nel mazzo questi scartati */
      restore: (ids: string[]) => dispatch({ type: 'restore', ids }),
      remove: (product: Product) => {
        track('remove', product)
        dispatch({ type: 'remove', id: product.id })
      },
      setFilters: (filters: Filters) => dispatch({ type: 'filters', filters }),
      /** Filtri di una sezione diversa da quella aperta (es. il genere scelto nel benvenuto vale anche per Beauty) */
      setSectionFilters: (section: Universe, filters: Filters) => dispatch({ type: 'filters', filters, section }),
      /** Cambia sezione (moda, tech, gadget…) */
      setMode: (mode: Universe) => dispatch({ type: 'mode', mode }),
      resetSeen: () => dispatch({ type: 'resetSeen' }),
      clearAll: () => dispatch({ type: 'clearAll' }),
      reloadCatalog: () => reloadCatalog(),
      /** Sposta un preferito in una cartella (undefined = toglie dalla cartella) */
      setFolder: (product: Product, folder?: string) => dispatch({ type: 'folder', id: product.id, folder: folder?.trim() || undefined }),
      /** Rinomina una cartella; senza nuovo nome la elimina (i prodotti restano nei preferiti) */
      renameFolder: (from: string, to?: string) => dispatch({ type: 'renameFolder', from, to: to?.trim() || undefined }),
    }),
    [reloadCatalog],
  )

  // Per il resto dell'app `state.filters` sono i filtri della sezione aperta.
  const view = useMemo(() => ({ ...state, filters: activeFilters }), [state, activeFilters])
  /** Prodotti della sezione aperta (per i filtri) */
  const sectionProducts = useMemo(() => products.filter((p) => universeOf(p.category) === state.mode), [products, state.mode])
  return { state: view, products: sectionProducts, allProducts: products, deck, previewing, sectionDisliked, wishlist, actions, sync, unseenDeals, markDealsSeen }
}

export type SyncStatus = 'off' | 'loading' | 'synced' | 'saving' | 'error'

/**
 * Con un account: all'accesso unisce i dati del dispositivo a quelli salvati online,
 * poi salva ogni modifica (con un piccolo ritardo per raggruppare gli swipe).
 */
function useCloudSync(state: State, dispatch: (a: Action) => void): SyncStatus {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [status, setStatus] = useState<SyncStatus>('loading')
  const hydratedFor = useRef<string | null>(null)
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  })

  useEffect(() => {
    hydratedFor.current = null
    if (!userId) return
    let cancelled = false
    fetchUserData(userId)
      .then(async (remote) => {
        if (cancelled) return
        const { wishlist, disliked, filters } = stateRef.current
        const merged = mergeUserData({ wishlist, disliked, filters }, remote)
        dispatch({ type: 'hydrate', ...merged })
        hydratedFor.current = userId
        await saveUserData(userId, merged)
        if (!cancelled) setStatus('synced')
      })
      .catch(() => !cancelled && setStatus('error'))
    return () => {
      cancelled = true
      setStatus('loading')
    }
  }, [userId, dispatch])

  useEffect(() => {
    if (!userId || hydratedFor.current !== userId) return
    const timer = setTimeout(() => {
      setStatus('saving')
      saveUserData(userId, { wishlist: state.wishlist, disliked: state.disliked, filters: state.filters })
        .then(() => setStatus('synced'))
        .catch(() => setStatus('error'))
    }, 1500)
    return () => clearTimeout(timer)
  }, [userId, state.wishlist, state.disliked, state.filters])

  return userId ? status : 'off'
}

type Store = ReturnType<typeof useAppStore>
const Ctx = createContext<Store | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const store = useAppStore()
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

// oxlint-disable-next-line react/only-export-components -- hook e provider stanno insieme
export function useApp() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp va usato dentro AppStateProvider')
  return ctx
}
