import { BadgePercent, Bell, BellRing, Heart, Share2, Trash2 } from 'lucide-react'
import { AmazonCart } from '../components/AmazonCart'
import { useEffect, useMemo, useState } from 'react'
import { NewBadge } from '../components/NewBadge'
import { DiscountBadge } from '../components/DiscountBadge'
import { FriendPicker } from '../components/SocialBits'
import { PriceTag } from '../components/PriceTag'
import { ProductImage } from '../components/ProductImage'
import { StoreLink } from '../components/StoreLink'
import { WishlistStory } from '../components/WishlistStory'
import { AMAZON_DISCLOSURE, FEATURES } from '../config/app'
import { WATCH_FOLDER, compareFolders, folderLabel } from '../config/folders'
import { universeOf } from '../config/categories'
import { brandAndStore } from '../config/stores'
import { discountBadge, fewLeft, freshPrice } from '../lib/price'
import { openProduct } from '../lib/productSheet'
import { shareList } from '../lib/share'
import { social } from '../lib/social'
import { routeHref } from '../lib/useHashRoute'
import { useApp } from '../state/AppState'
import { useAuth } from '../state/AuthState'
import type { Product } from '../types/product'

type WishSort = 'recenti' | 'prezzo_asc' | 'prezzo_desc' | 'sconto'

const priceOf = (p: Product) => freshPrice(p)?.price

export function WishlistPage() {
  const { wishlist: all, state, actions, markDealsSeen } = useApp()
  // Preferiti della sezione aperta (moda o tech)
  const wishlist = useMemo(() => all.filter((w) => universeOf(w.product.category) === state.mode), [all, state.mode])
  const deals = wishlist.filter((w) => w.deal !== null).length
  const [folder, setFolder] = useState<string | null>(null)
  const watchUser = !!useAuth().user
  const [sort, setSort] = useState<WishSort>('recenti')
  const [dealsOnly, setDealsOnly] = useState(false)
  const showDeals = dealsOnly && deals > 0
  const few = wishlist.filter((w) => w.inCatalog && fewLeft(w.product)).length
  const [fewOnly, setFewOnly] = useState(false)
  const showFew = fewOnly && few > 0 && !showDeals

  const folders = useMemo(() => {
    const count = new Map<string, number>()
    // Resta solo la cartella degli avvisi (Kevin, 13/10): le altre cartelle vecchie non si mostrano più.
    for (const w of wishlist) if (w.folder === WATCH_FOLDER) count.set(w.folder, (count.get(w.folder) ?? 0) + 1)
    return [...count].sort((a, b) => compareFolders(a[0], b[0]))
  }, [wishlist])
  // Cartella eliminata o svuotata: si torna a "Tutti".
  const current = folder && folders.some(([f]) => f === folder) ? folder : null

  const shown = useMemo(() => {
    const list = wishlist.filter(
      (w) => (!current || w.folder === current) && (!showDeals || w.deal !== null) && (!showFew || (w.inCatalog && fewLeft(w.product))),
    )
    if (sort === 'sconto') return list.sort((a, b) => (discountBadge(b.product) ?? 0) - (discountBadge(a.product) ?? 0))
    if (sort !== 'recenti') {
      const dir = sort === 'prezzo_asc' ? 1 : -1
      return list.sort((a, b) => {
        const pa = priceOf(a.product)
        const pb = priceOf(b.product)
        if (pa === undefined) return pb === undefined ? 0 : 1
        if (pb === undefined) return -1
        return (pa - pb) * dir
      })
    }
    return list
  }, [wishlist, current, sort, showDeals, showFew])

  // Aprendo i Preferiti l'avviso sul menu si spegne (l'etichetta sulle card resta).
  useEffect(() => {
    markDealsSeen()
  }, [markDealsSeen])

  if (wishlist.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <Heart className="size-12 text-rose-300" />
        <h2 className="text-xl font-semibold">Nessun preferito ancora</h2>
        <p className="text-neutral-500">Scorri a destra sui prodotti che ti piacciono: li ritrovi qui.</p>
        <a href={routeHref('scopri')} className="mt-2 rounded-full bg-neutral-900 px-5 py-3 font-semibold text-white">
          Inizia a scoprire
        </a>
      </div>
    )
  }

  const chip = (active: boolean) =>
    `flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ring-1 transition active:scale-95 ${
      active ? 'bg-neutral-900 text-white ring-neutral-900' : 'bg-white text-neutral-700 ring-neutral-200'
    }`

  // Pagina in tre parti: cartelle e filtri rapidi in alto, i prodotti, e in fondo cosa fare con la lista
  // (carrello Amazon, condividi, storia). Prima tutto stava sopra i prodotti.
  return (
    <div className="space-y-3 pb-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Preferiti</h1>
        <span className="text-sm text-neutral-500">{wishlist.length} prodotti</span>
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <FolderChip active={!current} onClick={() => setFolder(null)} label="Tutti" count={wishlist.length} />
        {folders.map(([name, n]) => (
          <FolderChip key={name} active={current === name} onClick={() => setFolder(name)} label={folderLabel(name)} count={n} />
        ))}
      </div>
      {current === WATCH_FOLDER ? (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          🔔 Ti avvisiamo appena uno di questi scende di prezzo{watchUser ? '.' : ': serve un account (Profilo).'} Gli altri preferiti
          non mandano più avvisi.
        </p>
      ) : (
        folders.length === 0 && (
          <p className="flex items-center gap-1.5 text-xs text-neutral-500">
            Tocca <Bell className="inline size-3.5 shrink-0" /> su un preferito per sapere quando scende di prezzo.
          </p>
        )
      )}
      <div className="flex items-center gap-2">
        <div className="-ml-1 flex min-w-0 flex-1 gap-2 overflow-x-auto py-1 pl-1 [scrollbar-width:none]">
          {deals > 0 && (
            <button
              type="button"
              onClick={() => {
                setDealsOnly(!showDeals)
                setFewOnly(false)
              }}
              aria-pressed={showDeals}
              className={showDeals ? chip(true) : `${chip(false)} !bg-emerald-50 !text-emerald-800 !ring-emerald-200`}
            >
              <BadgePercent className="size-3.5" /> {deals} in offerta
            </button>
          )}
          {few > 0 && (
            <button
              type="button"
              onClick={() => {
                setFewOnly(!showFew)
                setDealsOnly(false)
              }}
              aria-pressed={showFew}
              className={showFew ? chip(true) : `${chip(false)} !bg-amber-50 !text-amber-900 !ring-amber-200`}
            >
              ⏳ {few} stanno finendo
            </button>
          )}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as WishSort)}
          aria-label="Ordina i preferiti"
          className="h-8 shrink-0 rounded-full bg-white px-3 text-xs font-semibold ring-1 ring-neutral-200"
        >
          <option value="recenti">Più recenti</option>
          <option value="prezzo_asc">Prezzo più basso</option>
          <option value="prezzo_desc">Prezzo più alto</option>
          <option value="sconto">Sconto maggiore</option>
        </select>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map(({ product, inCatalog, folder: itemFolder }) => {
          const unavailable = product.availability === 'out_of_stock' || !inCatalog
          return (
            <li key={product.id} className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
              <div className="relative aspect-square">
                <button
                  type="button"
                  onClick={() => openProduct(product)}
                  aria-label={`Dettagli di ${product.title}`}
                  className="block size-full"
                >
                  <ProductImage product={product} className="size-full" />
                </button>
                {!unavailable && <DiscountBadge product={product} size="sm" />}
                {!unavailable && <NewBadge product={product} size="sm" />}
                {unavailable && (
                  <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-neutral-900/80 px-2 py-0.5 text-xs text-white">
                    Non disponibile
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => actions.setFolder(product, itemFolder === WATCH_FOLDER ? undefined : WATCH_FOLDER)}
                  aria-label={itemFolder === WATCH_FOLDER ? `Non avvisarmi più per ${product.title}` : `Avvisami se scende il prezzo di ${product.title}`}
                  aria-pressed={itemFolder === WATCH_FOLDER}
                  className={`absolute top-2 right-13 grid size-9 place-items-center rounded-full shadow ring-1 ring-black/5 active:scale-90 ${
                    itemFolder === WATCH_FOLDER ? 'bg-amber-400 text-[#1c1c1f]' : 'bg-white/90 text-neutral-600'
                  }`}
                >
                  {itemFolder === WATCH_FOLDER ? <BellRing className="size-4" /> : <Bell className="size-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => actions.remove(product)}
                  aria-label={`Rimuovi ${product.title}`}
                  className="absolute top-2 right-2 grid size-9 place-items-center rounded-full bg-white/90 text-neutral-600 shadow ring-1 ring-black/5 active:scale-90"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <p className="text-[11px] font-medium tracking-wide text-neutral-500 uppercase">
                  {brandAndStore(product)}
                </p>
                <h3 className="line-clamp-2 text-sm leading-snug font-medium">{product.title}</h3>
                <div className="mt-auto pt-1">
                  <PriceTag product={product} />
                </div>
                <StoreLink
                  product={product}
                  className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-full bg-neutral-900 px-3 py-2 text-sm font-semibold text-white active:scale-95"
                >
                  {product.searchQuery ? 'Cerca' : 'Acquista'}
                </StoreLink>
              </div>
            </li>
          )
        })}
      </ul>
      {shown.length > 0 && (
        <div className="space-y-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
          {/* Solo quelli disponibili ora: i preferiti usciti dal catalogo non si possono comprare. */}
          <AmazonCart products={shown.filter((w) => w.inCatalog).map((w) => w.product)} />
          <div className="flex gap-2">
            <ListShare name={null} products={shown.map((w) => w.product)} />
            <WishlistStory items={wishlist.map((w) => w.product)} section={state.mode} deals={deals} />
          </div>
        </div>
      )}
      <p className="text-center text-xs text-neutral-500">
        L'acquisto avviene sul sito del negozio. Prezzi e disponibilità possono cambiare.
      </p>
      {wishlist.some((w) => w.product.store === 'amazon') && (
        <p className="text-center text-xs text-neutral-400">{AMAZON_DISCLOSURE}</p>
      )}
    </div>
  )
}

function FolderChip(props: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.active}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ${
        props.active ? 'bg-neutral-900 text-white ring-neutral-900' : 'bg-white text-neutral-700 ring-neutral-200'
      }`}
    >
            {props.label}
      <span className={props.active ? 'opacity-70' : 'text-neutral-400'}>{props.count}</span>
    </button>
  )
}

/** Condividi la lista o la cartella: con un account la mandi in chat agli amici, oppure il link con altre app. */
function ListShare({ name, products }: { name: string | null; products: Product[] }) {
  const auth = useAuth()
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState('')
  const flash = (text: string) => {
    setToast(text)
    setTimeout(() => setToast(''), 2500)
  }
  const shareOutside = async () => {
    setOpen(false)
    if ((await shareList(name ?? 'I miei preferiti', products)) === 'copied') flash('Link copiato')
  }
  const toSend = products.slice(0, CHAT_MAX)
  return (
    <>
      <button
        type="button"
        onClick={() => (auth.user && FEATURES.social ? setOpen(true) : void shareOutside())}
        className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold ring-1 ring-neutral-200 active:scale-[0.98]"
      >
        <Share2 className="size-4" />
        {toast || 'Condividi la lista'}
      </button>
      {open && (
        <FriendPicker
          title={name ? `Manda la cartella "${name}"` : 'Manda i tuoi preferiti'}
          confirmLabel={toSend.length === 1 ? 'Manda' : `Manda ${toSend.length} prodotti`}
          onClose={() => setOpen(false)}
          onConfirm={async (codes) => {
            // Arrivano in chat come prodotti, uno per messaggio (i primi CHAT_MAX).
            let n = 0
            for (const p of toSend) n = await social.send(codes, 'consiglio', { productId: p.id })
            setOpen(false)
            flash(n === 1 ? 'Inviato in chat!' : `Inviato in chat a ${n}!`)
          }}
          extra={
            <>
              {products.length > CHAT_MAX && (
                <p className="mt-2 text-center text-xs text-neutral-500">In chat vanno i primi {CHAT_MAX} prodotti; con il link li vedono tutti.</p>
              )}
              <button type="button" onClick={shareOutside} className="mt-3 w-full text-center text-sm font-medium text-neutral-600 underline">
                Condividi il link con altre app
              </button>
            </>
          }
        />
      )}
    </>
  )
}

/** Quanti prodotti di una cartella si mandano in chat in una volta */
const CHAT_MAX = 10
