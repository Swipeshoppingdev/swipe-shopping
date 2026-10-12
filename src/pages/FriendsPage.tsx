import { BarChart3, Bell, Cake, Flame, Gift, Inbox, Layers, Search, Share2, Snowflake, Trash2, UserPlus, Users, X } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ProductImage } from '../components/ProductImage'
import { Avatar, FriendPicker, LoginNeeded, ProductPicker, ProductStrip, ReactionBar, useProductsById } from '../components/SocialBits'
import { openProduct } from '../lib/productSheet'
import { enablePush, pushAvailable, pushEnabledHere, pushPermission } from '../lib/push'
import { PushToggle } from '../components/PushToggle'
import { load, save } from '../lib/storage'
import {
  GIFT_TEMPLATES,
  LIST_MAX,
  MONTHS,
  POLL_MAX,
  profileUrl,
  shareLink,
  social,
  timeAgo,
  type Birthday,
  type FeedItem,
  type InboxItem,
  type GiftListSummary,
  type GiftTemplate,
  type MyProfile,
  type PollSummary,
  santaDate,
  santaTitle,
  refreshUnseen,
  type ChatSummary,
  type SantaSummary,
  type SocialCard,
  type SwipeSummary,
} from '../lib/social'
import { useApp } from '../state/AppState'
import { FEATURES } from '../config/app'
import { useAuth } from '../state/AuthState'
import { SantaCreator } from './SantaPage'

interface Data {
  me: MyProfile
  lists: GiftListSummary[]
  polls: PollSummary[]
  feed: FeedItem[]
  following: SocialCard[]
  followers: SocialCard[]
  inbox: InboxItem[]
  birthdays: Birthday[]
  swipes: SwipeSummary[]
  santas: SantaSummary[]
  trending: { product_id: string; friends: number }[]
  /** null finché supabase/schema-11.sql non è eseguito */
  chats: ChatSummary[] | null
}

type Tab = 'perte' | 'chat' | 'crea' | 'amici'
const TABS: { id: Tab; label: string }[] = [
  { id: 'perte', label: 'Per te' },
  { id: 'chat', label: 'Chat' },
  { id: 'crea', label: 'Crea' },
  { id: 'amici', label: 'Amici' },
]

/** Amici (#/amici): "Per te" (cose ricevute, compleanni, match, attività), "Crea" (sondaggi, liste, Swipe insieme), "Amici". */
export function FriendsPage() {
  const auth = useAuth()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [tab, setTabState] = useState<Tab>(() => load<Tab>('amiciTab', 'perte'))
  const setTab = (t: Tab) => {
    setTabState(t)
    save('amiciTab', t)
  }
  const userId = auth.user?.id

  const reload = useCallback(async () => {
    try {
      const me = await social.me()
      const [mine, feed, friends, inbox, birthdays, swipes, santas, trending, chats] = await Promise.all([
        social.mine(),
        social.feed(),
        social.friends(),
        social.inbox(),
        social.birthdays(),
        social.swipes(),
        // Finché supabase/schema-7.sql non è eseguito il resto della pagina funziona lo stesso.
        social.santas().catch(() => []),
        social.trending().catch(() => []),
        social.chats().catch(() => null),
      ])
      setData({ me, ...mine, feed, ...friends, inbox, birthdays, swipes, santas, trending, chats })
      setError('')
      // Aperta la scheda, le novità contano come viste (il pallino si spegne).
      if (inbox.some((i) => !i.seen && i.kind !== 'consiglio')) void social.inboxSeen().then(refreshUnseen)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    if (userId) void Promise.resolve().then(reload)
  }, [userId, reload])

  if (!auth.enabled) return <p className="py-10 text-center text-neutral-500">Gli amici arriveranno presto.</p>
  if (!auth.ready) return <p className="py-10 text-center text-neutral-500">Caricamento…</p>
  return (
    <div className="space-y-4 pb-6">
      <h1 className="text-2xl font-bold">Amici</h1>
      {!auth.user ? (
        <LoginNeeded text="Con un account puoi invitare gli amici, chiedere un parere sui prodotti e fare Swipe insieme." />
      ) : error && !data ? (
        <p className="rounded-2xl bg-white p-5 text-center text-sm text-neutral-600 ring-1 ring-black/5">{error}</p>
      ) : !data ? (
        <p className="py-10 text-center text-neutral-500">Caricamento…</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-1 rounded-full bg-neutral-200/60 p-1" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`relative rounded-full py-2 text-sm font-semibold ${tab === t.id ? 'bg-white shadow-sm' : 'text-neutral-500'}`}
              >
                {t.label}
                {((t.id === 'perte' && data.inbox.some((i) => !i.seen && i.kind !== 'consiglio')) ||
                  (t.id === 'chat' && !!data.chats?.some((c) => c.unread > 0))) && (
                  <span className="absolute top-1.5 ml-1 inline-block size-2 rounded-full bg-rose-500" />
                )}
              </button>
            ))}
          </div>
          <Loaded tab={tab} setTab={setTab} data={data} reload={reload} setData={setData} />
        </>
      )}
    </div>
  )
}

function Loaded(props: { tab: Tab; setTab: (t: Tab) => void; data: Data; reload: () => Promise<void>; setData: (d: Data) => void }) {
  const { tab, data, reload, setData } = props
  const { deck, products } = useApp()
  const [picker, setPicker] = useState<null | 'poll' | 'list' | 'swipe' | 'santa'>(null)
  const [template, setTemplate] = useState<GiftTemplate>('compleanno')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setNotice('')
    try {
      await fn()
      await reload()
    } catch (e) {
      setNotice((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const share = async (text: string, url: string) => {
    if ((await shareLink(text, url)) === 'copied') setNotice('Link copiato: incollalo dove vuoi.')
  }
  const updateMe = async (patch: Parameters<typeof social.update>[0]) => {
    const me = await social.update(patch)
    setData({ ...data, me })
    if (patch.shareSaves !== undefined) await reload()
  }

  const noFriends = data.following.length === 0 && data.followers.length === 0
  const chatsOn = data.chats !== null
  // Cose delle funzioni nascoste (FEATURES) non si mostrano.
  const inbox = data.inbox.filter((i) => visibleKind(i.kind, i.ref_kind, chatsOn))
  const feed = data.feed.filter((i) => (i.kind !== 'list' || FEATURES.giftLists) && (i.kind !== 'saves' || FEATURES.feedSaves))

  return (
    <>
      {notice && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">{notice}</p>}

      {tab === 'perte' && (
        <>
          <PushCard />
          {noFriends && (
            <div className="space-y-3 rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-100">
              <p className="text-sm text-rose-900">Qui arrivano consigli e sondaggi dei tuoi amici. Inizia invitandone qualcuno!</p>
              <button
                type="button"
                onClick={() => share(`Seguimi su Swipe Shopping! Sono ${data.me.handle}`, profileUrl(data.me.code))}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-rose-500 py-3 font-semibold text-[#fff] active:scale-[0.98]"
              >
                <Share2 className="size-4" /> Invita amici
              </button>
            </div>
          )}
          {inbox.length > 0 && (
            <Section icon={<Inbox className="size-5" />} title="Novità per te">
              {inbox.map((item) => (
                <InboxRow key={item.id} item={item} onDelete={() => act(() => social.inboxDelete(item.id))} />
              ))}
            </Section>
          )}
          {FEATURES.birthdays && data.birthdays.length > 0 && (
            <Section icon={<Cake className="size-5" />} title="Compleanni in arrivo">
              {data.birthdays.map((b) => (
                <a key={b.who.code} href={FEATURES.giftLists && b.list_id ? `#/regalo/${b.list_id}` : `#/u/${b.who.code}`} className="flex items-center gap-3 border-t border-neutral-100 pt-3">
                  <Avatar emoji={b.who.avatar} size="sm" />
                  <p className="flex-1 text-sm">
                    <strong>{b.who.handle}</strong>{' '}
                    {b.days_left === 0 ? 'compie gli anni oggi! 🎉' : b.days_left === 1 ? 'compie gli anni domani' : `compie gli anni tra ${b.days_left} giorni`}
                    <span className="block text-xs text-neutral-500">
                      {b.day} {MONTHS[b.month - 1]}
                      {FEATURES.giftLists && b.list_id ? ' · guarda la sua lista regalo' : ''}
                    </span>
                  </p>
                </a>
              ))}
            </Section>
          )}
          <Trending items={data.trending} />
          <Section icon={<Users className="size-5" />} title="Cosa fanno i tuoi amici">
            {feed.length === 0 ? (
              <p className="text-sm text-neutral-500">
                {noFriends ? 'Quando avrai degli amici, qui vedi i loro sondaggi.' : 'Ancora niente di nuovo dai tuoi amici.'}
              </p>
            ) : (
              feed.map((item, i) => <FeedRow key={`${item.kind}-${'id' in item ? item.id : item.who.code}-${i}`} item={item} />)
            )}
          </Section>
        </>
      )}

      {tab === 'chat' && <ChatList chats={data.chats} noFriends={noFriends} />}

      {tab === 'crea' && (
        <>
          <Section
            icon={<BarChart3 className="size-5" />}
            title="Aiutami a scegliere"
            action={
              <button type="button" disabled={busy} onClick={() => setPicker('poll')} className={smallBtn}>
                Nuovo
              </button>
            }
          >
            <p className="text-sm text-neutral-500">Scegli da 2 a {POLL_MAX} preferiti e mandali agli amici: votano sì o no.</p>
            {data.polls.map((poll) => (
              <Row
                key={poll.id}
                ids={poll.product_ids}
                title={poll.closed ? 'Sondaggio chiuso' : `Aperto fino al ${new Date(poll.closes_at).toLocaleDateString('it-IT')}`}
                subtitle={`${poll.voters ?? 0} ${poll.voters === 1 ? 'voto' : 'voti'}`}
                href={`#/sondaggio/${poll.id}`}
                onDelete={() => window.confirm('Eliminare il sondaggio?') && act(() => social.deletePoll(poll.id))}
              />
            ))}
          </Section>

          {FEATURES.giftLists && (
          <Section
            icon={<Gift className="size-5" />}
            title="Liste regalo"
            action={
              <button type="button" disabled={busy} onClick={() => setPicker('list')} className={smallBtn}>
                Nuova
              </button>
            }
          >
            <p className="text-sm text-neutral-500">Gli amici segnano "lo prendo io" e tu non vedi chi: la sorpresa resta.</p>
            {data.lists.map((list) => (
              <Row
                key={list.id}
                ids={list.product_ids}
                title={`${GIFT_TEMPLATES[list.template].emoji} ${GIFT_TEMPLATES[list.template].label}`}
                subtitle={`${list.product_ids.length} prodotti`}
                href={`#/regalo/${list.id}`}
                onDelete={() => window.confirm('Eliminare la lista?') && act(() => social.deleteList(list.id))}
              />
            ))}
          </Section>
          )}

          <Section
            icon={<Layers className="size-5" />}
            title="Swipe insieme"
            action={
              <button type="button" disabled={busy} onClick={() => setPicker('swipe')} className={smallBtn}>
                Nuovo
              </button>
            }
          >
            <p className="text-sm text-neutral-500">
              Tu e un amico scorrete gli stessi {SWIPE_SIZE} prodotti: alla fine vedete quelli piaciuti a entrambi. Perfetto per scegliere un regalo insieme.
            </p>
            {data.swipes.map((s) => (
              <Row
                key={s.id}
                ids={s.product_ids}
                title={`Con ${s.other.handle}`}
                subtitle={
                  s.my_done && s.other_done ? 'Finito: guarda i match!' : s.my_done ? `Aspetti ${s.other.handle}` : 'Tocca a te'
                }
                href={`#/insieme/${s.id}`}
                onDelete={() => window.confirm('Eliminare questo Swipe insieme?') && act(() => social.deleteSwipe(s.id))}
              />
            ))}
          </Section>

          {FEATURES.secretSanta && (
          <Section
            icon={<Snowflake className="size-5" />}
            title="Babbo Natale segreto"
            action={
              <button type="button" disabled={busy} onClick={() => setPicker('santa')} className={smallBtn}>
                Nuovo
              </button>
            }
          >
            <p className="text-sm text-neutral-500">Crea un gruppo e invita gli amici: l'app estrae a chi fa il regalo ognuno, e nessuno sa chi lo fa a lui.</p>
            {data.santas.map((s) => (
              <a key={s.id} href={`#/segreto/${s.id}`} className="block border-t border-neutral-100 pt-3">
                <p className="font-medium">{santaTitle(s.theme)}</p>
                <p className="text-xs text-neutral-500">
                  {s.members} {s.members === 1 ? 'persona' : 'persone'}
                  {s.budget ? ` · ${s.budget} €` : ''}
                  {s.exchange_on ? ` · ${santaDate(s.exchange_on)}` : ''}
                  {' · '}
                  {s.drawn ? (s.gives_to ? 'estrazione fatta: scopri a chi fai il regalo' : 'estrazione da rifare') : s.is_owner ? 'organizzi tu' : 'in attesa dell\'estrazione'}
                </p>
              </a>
            ))}
          </Section>
          )}
        </>
      )}

      {tab === 'amici' && (
        <>
          <button
            type="button"
            onClick={() => share(`Seguimi su Swipe Shopping! Sono ${data.me.handle}${data.me.tag ? ` (@${data.me.tag})` : ''}`, profileUrl(data.me.code))}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 py-3 font-semibold text-white active:scale-[0.98]"
          >
            <Share2 className="size-4" /> Invita amici
          </button>
          <FindFriend />
          <PushToggle />
          {FEATURES.birthdays && (
            <BirthdayCard me={data.me} onSave={(birthday) => act(() => updateMe({ birthday }))} />
          )}
          <Section icon={<UserPlus className="size-5" />} title={`Amici (${data.following.length} seguiti, ${data.followers.length} ti seguono)`}>
            {noFriends && <p className="text-sm text-neutral-500">Manda il tuo link con "Invita amici": chi lo apre può seguirti, e tu apri il suo.</p>}
            <FriendList
              title="Segui"
              people={data.following}
              actions={[{ label: 'Smetti di seguire', run: (c) => act(() => social.unfriend(c, 'unfollow')) }]}
            />
            <FriendList
              title="Ti seguono"
              people={data.followers}
              actions={[
                { label: 'Rimuovi', run: (c) => act(() => social.unfriend(c, 'remove')) },
                {
                  label: 'Blocca',
                  run: (c) => window.confirm('Bloccare? Non potrà più seguirti né mandarti nulla.') && act(() => social.unfriend(c, 'block')),
                },
              ]}
            />
          </Section>
        </>
      )}

      {picker === 'poll' && (
        <ProductPicker
          title="Aiutami a scegliere"
          hint={`Scegli da 2 a ${POLL_MAX} preferiti da far votare.`}
          min={2}
          max={POLL_MAX}
          confirmLabel="Crea"
          onClose={() => setPicker(null)}
          onConfirm={(ids) => {
            setPicker(null)
            void act(async () => {
              // Si apre il sondaggio, con i pulsanti per mandarlo agli amici.
              window.location.hash = `#/sondaggio/${await social.createPoll(ids)}`
            })
          }}
        />
      )}
      {picker === 'list' && (
        <ProductPicker
          title="Nuova lista regalo"
          hint={`Scegli il tipo di lista e fino a ${LIST_MAX} preferiti.`}
          min={1}
          max={LIST_MAX}
          confirmLabel="Crea"
          onClose={() => setPicker(null)}
          onConfirm={(ids) => {
            setPicker(null)
            void act(async () => {
              window.location.hash = `#/regalo/${await social.saveList(null, template, ids)}`
            })
          }}
        >
          <TemplateChips value={template} onChange={setTemplate} />
        </ProductPicker>
      )}
      {picker === 'santa' && <SantaCreator onClose={() => setPicker(null)} />}
      {picker === 'swipe' && (
        <FriendPicker
          title="Swipe insieme con…"
          single
          confirmLabel="Inizia"
          onClose={() => setPicker(null)}
          onConfirm={async ([code]) => {
            // Un mazzo a caso dalla sezione aperta (prodotti non ancora visti, se possibile).
            const pool = (deck.length >= SWIPE_SIZE ? deck : products).filter((p) => p.availability !== 'out_of_stock')
            const ids = shuffle(pool.map((p) => p.id)).slice(0, SWIPE_SIZE)
            if (ids.length < 4) throw new Error('Pochi prodotti in questa sezione: cambia sezione o filtri e riprova.')
            const id = await social.createSwipe(code, ids)
            setPicker(null)
            window.location.hash = `#/insieme/${id}`
          }}
        />
      )}
    </>
  )
}

const SWIPE_SIZE = 10

function visibleKind(kind: InboxItem['kind'], refKind: InboxItem['ref_kind'], chatsEnabled: boolean) {
  // I prodotti consigliati stanno nella Chat (se è attiva, cioè dopo schema-11.sql).
  if (kind === 'consiglio') return !chatsEnabled
  if (kind === 'lista' || (kind === 'reazione' && refKind === 'list')) return FEATURES.giftLists
  if (kind === 'segreto' || kind === 'estrazione') return FEATURES.secretSanta
  return true
}

/** Invito ad attivare le notifiche (solo nell'app Android, finché non sono attive). */
function PushCard() {
  const [state, setState] = useState<'hidden' | 'ask' | 'denied'>('hidden')
  useEffect(() => {
    if (!pushAvailable || pushEnabledHere()) return
    void pushPermission().then((p) => setState(p === 'denied' ? 'denied' : 'ask'))
  }, [])
  if (state === 'hidden') return null
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-neutral-900 p-4 text-white">
      <Bell className="size-6 shrink-0" />
      <p className="flex-1 text-sm">
        {state === 'denied'
          ? 'Notifiche bloccate: attivale dalle impostazioni del telefono per sapere quando un amico ti manda qualcosa.'
          : 'Attiva le notifiche: ti avvisiamo quando un amico ti manda qualcosa o un tuo preferito è in offerta.'}
      </p>
      {state === 'ask' && (
        <button
          type="button"
          onClick={async () => setState((await enablePush()) ? 'hidden' : 'denied')}
          className="rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold text-neutral-900"
        >
          Attiva
        </button>
      )}
    </div>
  )
}

/** Cerca un amico con il suo @tag (esatto): si apre il suo profilo, da lì lo segui. */
function FindFriend() {
  const [tag, setTag] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const search = async () => {
    if (!tag.trim()) return
    setBusy(true)
    setMessage('')
    try {
      const code = await social.find(tag)
      if (code) window.location.hash = `#/u/${code}`
      else setMessage('Nessuno con questo tag. Controlla di averlo scritto bene, es. @volperosa482.')
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Section icon={<Search className="size-5" />} title="Cerca un amico">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void search()
        }}
        className="flex gap-2"
      >
        <input
          type="search"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder="@tag del tuo amico"
          aria-label="Tag dell'amico"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={40}
          className="min-w-0 flex-1 rounded-full bg-neutral-100 px-4 py-2 text-base outline-none focus:ring-2 focus:ring-rose-300"
        />
        <button type="submit" disabled={busy || !tag.trim()} className={smallBtn}>
          Cerca
        </button>
      </form>
      {message && <p className="text-sm text-neutral-500">{message}</p>}
    </Section>
  )
}

/** I prodotti salvati da più amici questa settimana (solo chi mostra i preferiti, senza dire chi). */
function Trending({ items }: { items: { product_id: string; friends: number }[] }) {
  const { products } = useProductsById(items.length ? items.map((i) => i.product_id) : undefined)
  const shown = items.map((i) => ({ ...i, product: products.find((p) => p.id === i.product_id) })).filter((i) => i.product)
  if (shown.length === 0) return null
  return (
    <Section icon={<Flame className="size-5" />} title="Di tendenza tra i tuoi amici">
      <p className="text-sm text-neutral-500">I prodotti che i tuoi amici hanno salvato di più questa settimana.</p>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
        {shown.map(({ product, friends }) => (
          <button
            key={product!.id}
            type="button"
            onClick={() => openProduct(product!)}
            className="w-32 shrink-0 snap-start space-y-1.5 text-left"
          >
            <ProductImage product={product!} className="aspect-square w-full overflow-hidden rounded-xl bg-[#fff] ring-1 ring-black/5 [&_span]:text-4xl" />
            <span className="line-clamp-2 text-xs font-medium">{product!.title}</span>
            <span className="block text-xs font-semibold text-rose-500">
              {friends === 1 ? 'Salvato da 1 amico' : `Salvato da ${friends} amici`}
            </span>
          </button>
        ))}
      </div>
    </Section>
  )
}

/** Elenco chat: un amico per riga, con l'ultimo messaggio e il pallino se c'è qualcosa di nuovo. */
function ChatList({ chats, noFriends }: { chats: ChatSummary[] | null; noFriends: boolean }) {
  if (!chats || chats.length === 0)
    return (
      <p className="rounded-2xl bg-white p-5 text-center text-sm text-neutral-600 ring-1 ring-black/5">
        {!chats
          ? 'Chat non ancora attiva. Riprova più tardi.'
          : noFriends
            ? 'Quando avrai degli amici, qui potrai mandarvi i prodotti che vi piacciono.'
            : 'Nessuna chat per ora.'}
      </p>
    )
  const last = (c: ChatSummary) =>
    !c.last_kind
      ? 'Mandagli un prodotto'
      : `${c.last_from_me ? 'Tu: ' : ''}${c.last_kind === 'sondaggio' ? 'un sondaggio' : c.last_kind === 'swipe' ? 'Swipe insieme' : 'un prodotto'} · ${timeAgo(c.last_at!)}`
  return (
    <section className="divide-y divide-neutral-100 rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
      {chats.map((c) => (
        <a key={c.who.code} href={`#/chat/${c.who.code}`} className="flex items-center gap-3 p-3 active:bg-neutral-50">
          <Avatar emoji={c.who.avatar} />
          <div className="min-w-0 flex-1">
            <p className={`truncate ${c.unread ? 'font-bold' : 'font-medium'}`}>{c.who.handle}</p>
            <p className={`truncate text-sm ${c.unread ? 'font-semibold text-neutral-900' : 'text-neutral-500'}`}>
              {c.unread ? (c.unread === 1 ? 'Ti ha mandato un prodotto' : `Ti ha mandato ${c.unread} prodotti`) : last(c)}
            </p>
          </div>
          {c.unread > 0 && <span className="size-2.5 rounded-full bg-rose-500" aria-label="Nuovo" />}
        </a>
      ))}
    </section>
  )
}

function shuffle<T>(list: T[]) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function InboxRow({ item, onDelete }: { item: InboxItem; onDelete: () => void }) {
  const { products } = useProductsById(item.product_id ? [item.product_id] : undefined)
  const product = products[0]
  const t = item.template ? GIFT_TEMPLATES[item.template] : null
  const text =
    item.kind === 'consiglio'
      ? 'ti consiglia questo'
      : item.kind === 'sondaggio'
        ? 'ti chiede un parere: quale preferisci?'
        : item.kind === 'lista'
          ? `ti ha mandato la lista ${t ? `${t.emoji} ${t.label}` : ''}`
          : item.kind === 'swipe'
            ? 'ti invita a Swipe insieme'
            : item.kind === 'segreto'
              ? 'ti invita al Babbo Natale segreto 🎅'
              : item.kind === 'estrazione'
                ? 'ha fatto l\'estrazione del Babbo Natale segreto: scopri a chi fai il regalo! 🎁'
                : `ha reagito ${item.emoji ?? ''} ${item.ref_kind === 'list' ? 'alla tua lista' : 'al tuo sondaggio'}`
  const href =
    item.kind === 'sondaggio' || (item.kind === 'reazione' && item.ref_kind === 'poll')
      ? `#/sondaggio/${item.ref_id}`
      : item.kind === 'lista' || (item.kind === 'reazione' && item.ref_kind === 'list')
        ? `#/regalo/${item.ref_id}`
        : item.kind === 'swipe'
          ? `#/insieme/${item.ref_id}`
          : item.kind === 'segreto' || item.kind === 'estrazione'
            ? `#/segreto/${item.ref_id}`
            : null
  if (item.kind === 'consiglio' && !product) return null
  const body = (
    <>
      <div className="flex items-start gap-2">
        <Avatar emoji={item.who.avatar} size="sm" />
        <p className="flex-1 text-sm">
          {!item.seen && <span className="mr-1 inline-block size-2 rounded-full bg-rose-500" aria-label="Nuovo" />}
          <strong>{item.who.handle}</strong> {text}
          <span className="block text-xs text-neutral-400">{timeAgo(item.at)}</span>
        </p>
      </div>
      {product ? (
        <div className="flex items-center gap-3 pl-11">
          <ProductImage product={product} className="size-16 shrink-0 overflow-hidden rounded-xl bg-[#fff] ring-1 ring-black/5 [&_span]:text-3xl" />
          <span className="line-clamp-2 text-sm font-medium">{product.title}</span>
        </div>
      ) : (
        item.product_ids && item.kind !== 'reazione' && (
          <div className="pl-11">
            <ProductStrip ids={item.product_ids} />
          </div>
        )
      )}
    </>
  )
  return (
    <div className="relative border-t border-neutral-100 pt-3">
      {product ? (
        <button type="button" onClick={() => openProduct(product)} className="block w-full space-y-2 text-left">
          {body}
        </button>
      ) : href ? (
        <a href={href} className="block space-y-2">
          {body}
        </a>
      ) : (
        <div className="space-y-2">{body}</div>
      )}
      <button type="button" onClick={onDelete} aria-label="Elimina" className="absolute top-3 right-0 text-neutral-300">
        <X className="size-4" />
      </button>
    </div>
  )
}

function BirthdayCard({ me, onSave }: { me: MyProfile; onSave: (b: { day: number; month: number } | null) => void }) {
  const [day, setDay] = useState(me.birth_day ?? 0)
  const [month, setMonth] = useState(me.birth_month ?? 0)
  const changed = day !== (me.birth_day ?? 0) || month !== (me.birth_month ?? 0)
  const select = 'rounded-full bg-white px-3 py-2 text-sm ring-1 ring-neutral-200'
  return (
    <Section icon={<Cake className="size-5" />} title="Il tuo compleanno">
      <p className="text-sm text-neutral-500">Solo giorno e mese: chi ti segue lo vede tra i compleanni in arrivo.</p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={day} onChange={(e) => setDay(Number(e.target.value))} aria-label="Giorno" className={select}>
          <option value={0}>Giorno</option>
          {Array.from({ length: 31 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="Mese" className={select}>
          <option value={0}>Mese</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        {changed && day > 0 && month > 0 && (
          <button type="button" onClick={() => onSave({ day, month })} className={smallBtn}>
            Salva
          </button>
        )}
        {me.birth_month && !changed && (
          <button
            type="button"
            onClick={() => {
              setDay(0)
              setMonth(0)
              onSave(null)
            }}
            className="text-sm text-neutral-500 underline"
          >
            Rimuovi
          </button>
        )}
      </div>
    </Section>
  )
}

const smallBtn = 'rounded-full bg-rose-500 px-3.5 py-1.5 text-sm font-semibold text-[#fff] active:scale-95 disabled:opacity-50'

function Section({ icon, title, action, children }: { icon: ReactNode; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <span className="text-rose-500">{icon}</span>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Row(props: { ids: string[]; title: string; subtitle: string; href: string; onDelete: () => void }) {
  return (
    <div className="relative border-t border-neutral-100 pt-3">
      <a href={props.href} className="block space-y-2">
        <div>
          <p className="font-medium">{props.title}</p>
          <p className="text-xs text-neutral-500">{props.subtitle}</p>
        </div>
        <ProductStrip ids={props.ids} />
      </a>
      <button type="button" onClick={props.onDelete} className="absolute top-3 right-0 text-neutral-400" aria-label="Elimina">
        <Trash2 className="size-4" />
      </button>
    </div>
  )
}

function FeedRow({ item }: { item: FeedItem }) {
  const text =
    item.kind === 'poll'
      ? 'chiede un parere: quale preferisci?'
      : item.kind === 'list'
        ? `ha una lista: ${GIFT_TEMPLATES[item.template].emoji} ${GIFT_TEMPLATES[item.template].label}`
        : `ha salvato ${item.count === 1 ? 'un prodotto' : `${item.count} prodotti`}`
  const href = item.kind === 'poll' ? `#/sondaggio/${item.id}` : item.kind === 'list' ? `#/regalo/${item.id}` : `#/u/${item.who.code}`
  return (
    <div className="space-y-2 border-t border-neutral-100 pt-3">
      <a href={href} className="block space-y-2">
        <div className="flex items-center gap-2">
          <Avatar emoji={item.who.avatar} size="sm" />
          <p className="text-sm">
            <strong>{item.who.handle}</strong> {text}
            <span className="block text-xs text-neutral-400">{timeAgo(item.at)}</span>
          </p>
        </div>
        <ProductStrip ids={item.product_ids} />
      </a>
      {item.kind !== 'saves' && <ReactionBar kind={item.kind} id={item.id} initial={item.reactions} />}
    </div>
  )
}

function FriendList(props: { title: string; people: SocialCard[]; actions: { label: string; run: (code: string) => unknown }[] }) {
  if (props.people.length === 0) return null
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">{props.title}</p>
      {props.people.map((p) => (
        <div key={p.code} className="flex items-center gap-2">
          <a href={`#/u/${p.code}`} className="flex min-w-0 flex-1 items-center gap-2">
            <Avatar emoji={p.avatar} size="sm" />
            <span className="truncate text-sm font-medium">{p.handle}</span>
          </a>
          {props.actions.map((a) => (
            <button key={a.label} type="button" onClick={() => a.run(p.code)} className="text-xs font-medium text-neutral-500 underline">
              {a.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

export function TemplateChips({ value, onChange }: { value: GiftTemplate; onChange: (t: GiftTemplate) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(Object.keys(GIFT_TEMPLATES) as GiftTemplate[]).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          aria-pressed={value === t}
          className={`rounded-full px-3 py-1 text-sm ring-1 ${
            value === t ? 'bg-neutral-900 text-white ring-neutral-900' : 'bg-white text-neutral-700 ring-neutral-200'
          }`}
        >
          {GIFT_TEMPLATES[t].emoji} {GIFT_TEMPLATES[t].label}
        </button>
      ))}
    </div>
  )
}
