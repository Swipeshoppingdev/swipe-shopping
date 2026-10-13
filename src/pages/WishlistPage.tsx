import { BadgePercent, FolderInput, Heart, Share2, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { FolderPicker } from '../components/FolderPicker'
import { NewBadge } from '../components/NewBadge'
import { DiscountBadge } from '../components/DiscountBadge'
import { SendButton } from '../components/SendButton'
import { FriendPicker } from '../components/SocialBits'
import { PriceTag } from '../components/PriceTag'
import { ProductImage } from '../components/ProductImage'
import { StoreLink } from '../components/StoreLink'
import { WishlistStory } from '../components/WishlistStory'
import { AMAZON_DISCLOSURE } from '../config/app'
import { WATCH_FOLDER, compareFolders, folderLabel, isPresetFolder } from '../config/folders'
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
  const [moving, setMoving] = useState<Product | null>(null)
  const [dealsOnly, setDealsOnly] = useState(false)
  const showDeals = dealsOnly && deals > 0
  const few = wishlist.filter((w) => w.inCatalog && fewLeft(w.product)).length
  const [fewOnly, setFewOnly] = useState(false)
  const showFew = fewOnly && few > 0 && !showDeals

  const folders = useMemo(() => {
    const count = new Map<string, number>()
    for (const w of wishlist) if (w.folder) count.set(w.folder, (count.get(w.folder) ?? 0) + 1)
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

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Preferiti</h1>
        <span className="flex items-center gap-3 text-sm text-neutral-500">
          {wishlist.length} prodotti
          <WishlistStory items={wishlist.map((w) => w.product)} section={state.mode} deals={deals} />
        </span>
      </div>
      {deals > 0 && (
        <button
          type="button"
          onClick={() => {
            setDealsOnly(!showDeals)
            setFewOnly(false)
          }}
          aria-pressed={showDeals}
          className={`flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left text-sm font-medium ring-1 active:scale-[0.99] ${
            showDeals ? 'bg-emerald-600 text-[#fff] ring-emerald-600' : 'bg-emerald-50 text-emerald-800 ring-emerald-200'
          }`}
        >
          <BadgePercent className="size-5 shrink-0" />
          <span className="flex-1">
            {showDeals
              ? `Solo i preferiti in offerta (${deals})`
              : deals === 1
                ? 'Un tuo preferito è in offerta!'
                : `${deals} preferiti sono in offerta!`}
          </span>
          <span className="text-xs font-semibold underline">{showDeals ? 'Mostra tutti' : 'Mostra'}</span>
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
          className={`flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left text-sm font-medium ring-1 active:scale-[0.99] ${
            showFew ? 'bg-amber-500 text-[#fff] ring-amber-500' : 'bg-amber-50 text-amber-900 ring-amber-200'
          }`}
        >
          <span className="text-lg leading-none">⏳</span>
          <span className="flex-1">
            {showFew ? `Solo quelli che stanno finendo (${few})` : few === 1 ? 'Un tuo preferito sta finendo!' : `${few} preferiti stanno finendo!`}
          </span>
          <span className="text-xs font-semibold underline">{showFew ? 'Mostra tutti' : 'Mostra'}</span>
        </button>
      )}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <FolderChip active={!current} onClick={() => setFolder(null)} label="Tutti" count={wishlist.length} />
        {folders.map(([name, n]) => (
          <FolderChip key={name} active={current === name} onClick={() => setFolder(name)} label={folderLabel(name)} count={n} />
        ))}
      </div>
      {current === WATCH_FOLDER && (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          🔔 Ti avvisiamo appena uno di questi va in offerta{watchUser ? '.' : ': serve un account (Profilo).'} Gli altri preferiti
          non mandano più avvisi.
        </p>
      )}
      {shown.length > 0 && <ListShare name={current && isPresetFolder(current) ? current : null} products={shown.map((w) => w.product)} />}
      <div className="flex items-center justify-between gap-3 text-sm">
        {current ? (
          <span className="flex gap-3">
            <button
              type="button"
              className="font-medium text-rose-600 underline"
              onClick={() => window.confirm(`Svuotare la cartella "${current}"? I prodotti restano nei preferiti.`) && actions.renameFolder(current)}
            >
              Svuota cartella
            </button>
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-neutral-500">
            Tocca <FolderInput className="inline size-3.5 shrink-0" /> per le cartelle
          </span>
        )}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as WishSort)}
          aria-label="Ordina i preferiti"
          className="rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-neutral-200"
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
                  onClick={() => setMoving(product)}
                  aria-label={`Sposta ${product.title} in una cartella`}
                  className={`absolute top-2 right-24 grid size-9 place-items-center rounded-full shadow ring-1 ring-black/5 active:scale-90 ${
                    itemFolder ? 'bg-neutral-900 text-white' : 'bg-white/90 text-neutral-600'
                  }`}
                >
                  <FolderInput className="size-4" />
                </button>
                <SendButton
                  product={product}
                  className="absolute top-2 right-13 grid size-9 place-items-center rounded-full bg-white/90 text-neutral-600 shadow ring-1 ring-black/5 active:scale-90"
                />
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
      {moving && <FolderPicker product={moving} onClose={() => setMoving(null)} />}
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
        onClick={() => (auth.user ? setOpen(true) : void shareOutside())}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-2.5 text-sm font-semibold ring-1 ring-neutral-200 active:scale-[0.98]"
      >
        <Share2 className="size-4" />
        {toast || (name ? `Condividi la cartella "${name}"` : 'Condividi questa lista')}
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
