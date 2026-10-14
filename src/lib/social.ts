import { load, save } from './storage'
import { getSupabase } from './supabase'

/**
 * Parte social (supabase/schema-4.sql): profili con nome generato, amici, liste regalo, sondaggi.
 * Solo azioni prestabilite: nessun testo libero scritto dagli utenti.
 */

export interface SocialCard {
  handle: string
  avatar: string
  code: string
  /** @tag per cercare (supabase/schema-8.sql), ricavato dal nome */
  tag?: string
}

export interface MyProfile extends SocialCard {
  share_saves: boolean
  birth_day: number | null
  birth_month: number | null
  followers: number
  following: number
}

export interface GiftListSummary {
  id: string
  template: GiftTemplate
  product_ids: string[]
}

export interface PollSummary {
  id: string
  product_ids: string[]
  closes_at: string
  closed?: boolean
  voters?: number
}

export interface FriendProfile extends SocialCard {
  is_me: boolean
  following: boolean
  follows_me: boolean
  followers: number
  lists: GiftListSummary[]
  polls: PollSummary[]
}

export interface Reactions {
  counts: Record<string, number>
  mine: string | null
}

export type FeedItem =
  | { kind: 'poll'; id: string; product_ids: string[]; at: string; who: SocialCard; reactions?: Reactions }
  | { kind: 'list'; id: string; template: GiftTemplate; product_ids: string[]; at: string; who: SocialCard; reactions?: Reactions }
  | { kind: 'saves'; product_ids: string[]; count: number; at: string; who: SocialCard }

export interface GiftList extends GiftListSummary {
  owner: SocialCard
  is_owner: boolean
  updated_at: string
  claims: { product_id: string; mine: boolean }[]
}

export interface Poll extends PollSummary {
  owner: SocialCard
  is_owner: boolean
  closed: boolean
  voters: number
  my_votes: Record<string, boolean>
  results: { product_id: string; yes: number; no: number }[] | null
}

export interface InboxItem {
  id: number
  kind: 'consiglio' | 'sondaggio' | 'lista' | 'swipe' | 'reazione' | 'segreto' | 'estrazione' | 'sfida'
  product_id: string | null
  ref_id: string | null
  ref_kind: 'poll' | 'list' | null
  emoji: string | null
  template: GiftTemplate | null
  product_ids: string[] | null
  at: string
  seen: boolean
  who: SocialCard
}

export interface Birthday {
  who: SocialCard
  day: number
  month: number
  days_left: number
  list_id: string | null
}

export interface SwipeSession {
  id: string
  product_ids: string[]
  created_at: string
  is_creator: boolean
  other: SocialCard
  my_votes: Record<string, boolean>
  other_done: boolean
  matches: string[] | null
}

export interface SwipeSummary {
  id: string
  created_at: string
  other: SocialCard
  my_done: boolean
  other_done: boolean
  product_ids: string[]
}

/** Babbo Natale segreto (supabase/schema-7.sql). */
export const SANTA_THEMES = {
  famiglia: { label: 'In famiglia', emoji: '👨‍👩‍👧' },
  amici: { label: 'Tra amici', emoji: '🥂' },
  ufficio: { label: 'In ufficio', emoji: '💼' },
  classe: { label: 'In classe', emoji: '🎒' },
  squadra: { label: 'Squadra', emoji: '⚽' },
  casa: { label: 'Coinquilini', emoji: '🏠' },
} as const
export type SantaTheme = keyof typeof SANTA_THEMES
export const SANTA_BUDGETS = [10, 15, 20, 25, 30, 50, 100]
export const santaTitle = (theme: SantaTheme) => `${SANTA_THEMES[theme].emoji} ${SANTA_THEMES[theme].label}`
/** "24 dicembre" */
export const santaDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })

export interface SantaMember extends SocialCard {
  is_me: boolean
  ready: boolean
  has_list: boolean
}

export interface SantaGroup {
  id: string
  theme: SantaTheme
  budget: number | null
  exchange_on: string | null
  drawn: boolean
  broken: boolean
  is_owner: boolean
  is_member: boolean
  owner: SocialCard
  members: SantaMember[]
  my_list_id: string | null
  my_ready: boolean
  gives_to: SocialCard | null
  gives_to_list: GiftListSummary | null
}

export interface SantaSummary {
  id: string
  theme: SantaTheme
  budget: number | null
  exchange_on: string | null
  drawn: boolean
  is_owner: boolean
  members: number
  gives_to: SocialCard | null
}

/** Chat (supabase/schema-11.sql): solo prodotti, sondaggi e inviti a Swipe insieme, più un'emoji di risposta. */
export interface ChatSummary {
  who: SocialCard
  last_at: string | null
  last_kind: InboxItem['kind'] | null
  last_from_me: boolean | null
  unread: number
}

export interface ChatMessage {
  id: number
  kind: 'consiglio' | 'sondaggio' | 'swipe'
  from_me: boolean
  product_id: string | null
  ref_id: string | null
  product_ids: string[] | null
  reply_emoji: string | null
  at: string
  seen: boolean
}

/** Reazioni disponibili (le stesse del database). */
export const REACTIONS = ['❤️', '🔥', '😍', '😂', '💸']

/** Avatar disponibili (gli stessi del database). */
export const AVATARS = ['🦊', '🐼', '🐨', '🐯', '🦁', '🐸', '🐵', '🐧', '🦄', '🐙', '🐝', '🦋', '🐢', '🐬', '🦉', '🐰', '🐱', '🐶', '🦔', '🦦', '🦩', '🐳', '🐺', '🐻', '🐹', '🐥']

export const GIFT_TEMPLATES = {
  compleanno: { label: 'Il mio compleanno', emoji: '🎂' },
  natale: { label: 'Natale', emoji: '🎄' },
  laurea: { label: 'La mia laurea', emoji: '🎓' },
  matrimonio: { label: 'Matrimonio', emoji: '💍' },
  casa_nuova: { label: 'Casa nuova', emoji: '🏡' },
  idee_regalo: { label: 'Idee regalo', emoji: '🎁' },
  desideri: { label: 'I miei desideri', emoji: '✨' },
} as const
export type GiftTemplate = keyof typeof GIFT_TEMPLATES

export const POLL_MAX = 5
export const LIST_MAX = 60

/** Messaggi d'errore del database in italiano semplice. */
function friendly(message: string) {
  const m = message.toLowerCase()
  if (m.includes('could not find the function') || m.includes('does not exist')) return 'Funzione non ancora attiva. Riprova più tardi.'
  if (m.includes('failed to fetch') || m.includes('network')) return 'Connessione assente. Riprova.'
  return message
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const supabase = await getSupabase()
  if (!supabase) throw new Error('Account non disponibile.')
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(friendly(error.message))
  return data as T
}

/** Chi vota senza account: un codice casuale salvato sul telefono. */
function anonVoter() {
  let id = load<string | null>('pollVoter', null)
  if (!id) {
    id = `anon:${crypto.randomUUID()}`
    save('pollVoter', id)
  }
  return id
}

export const social = {
  me: () => rpc<MyProfile>('social_me'),
  /** birthday: null lo cancella */
  update: (patch: { regenerate?: boolean; avatar?: string; shareSaves?: boolean; birthday?: { day: number; month: number } | null }) =>
    rpc<MyProfile>('social_update', {
      regenerate: patch.regenerate ?? false,
      new_avatar: patch.avatar ?? null,
      new_share_saves: patch.shareSaves ?? null,
      new_birth_day: patch.birthday?.day ?? null,
      new_birth_month: patch.birthday === null ? 0 : (patch.birthday?.month ?? null),
    }),
  /** Prodotti salvati da più amici negli ultimi 7 giorni (senza dire chi). */
  trending: () => rpc<{ product_id: string; friends: number }[]>('social_trending'),
  chats: () => rpc<ChatSummary[]>('chat_list'),
  chat: (code: string) => rpc<{ who: SocialCard; messages: ChatMessage[] } | null>('chat_get', { p_code: code }),
  chatSeen: (code: string) => rpc<void>('chat_seen', { p_code: code }),
  chatReact: (id: number, emoji: string | null) => rpc<void>('chat_react', { p_id: id, p_emoji: emoji }),
  /** Codice del profilo con quel tag (o nome), null se non c'è. */
  find: (tag: string) => rpc<string | null>('social_find', { p_tag: tag }),
  profile: (code: string) => rpc<FriendProfile | null>('social_profile', { p_code: code }),
  follow: (code: string) => rpc<void>('social_follow', { p_code: code }),
  unfriend: (code: string, action: 'unfollow' | 'remove' | 'block') => rpc<void>('social_unfriend', { p_code: code, action }),
  friends: () => rpc<{ following: SocialCard[]; followers: SocialCard[] }>('social_friends'),
  feed: () => rpc<FeedItem[]>('social_feed'),
  mine: () => rpc<{ lists: GiftListSummary[]; polls: PollSummary[] }>('social_mine'),
  saveList: (id: string | null, template: GiftTemplate, productIds: string[]) =>
    rpc<string>('gift_list_save', { p_id: id, p_template: template, p_product_ids: productIds.slice(0, LIST_MAX) }),
  deleteList: (id: string) => rpc<void>('gift_list_delete', { p_id: id }),
  list: (id: string) => rpc<GiftList | null>('gift_list_get', { p_id: id }),
  claim: (id: string, productId: string, claim: boolean) => rpc<void>('gift_list_claim', { p_id: id, p_product_id: productId, p_claim: claim }),
  createPoll: (productIds: string[]) => rpc<string>('poll_create', { p_product_ids: productIds.slice(0, POLL_MAX) }),
  deletePoll: (id: string) => rpc<void>('poll_delete', { p_id: id }),
  poll: (id: string) => rpc<Poll | null>('poll_get', { p_id: id, p_voter: anonVoter() }),
  vote: (id: string, productId: string, yes: boolean) =>
    rpc<void>('poll_vote', { p_id: id, p_voter: anonVoter(), p_product_id: productId, p_yes: yes }),
  birthdays: () => rpc<Birthday[]>('social_birthdays'),
  /** Manda a degli amici (codici) un prodotto consigliato, un mio sondaggio o una mia lista. Ritorna quanti l'hanno ricevuto. */
  send: (codes: string[], kind: 'consiglio' | 'sondaggio' | 'lista', ref: { productId?: string; id?: string }) =>
    rpc<number>('inbox_send', { p_codes: codes, p_kind: kind, p_product_id: ref.productId ?? null, p_ref: ref.id ?? null }),
  inbox: () => rpc<InboxItem[]>('inbox_list'),
  inboxUnseen: () => rpc<number>('inbox_unseen'),
  inboxSeen: () => rpc<void>('inbox_seen'),
  inboxDelete: (id: number) => rpc<void>('inbox_delete', { p_id: id }),
  react: (kind: 'poll' | 'list', id: string, emoji: string | null) => rpc<Reactions>('react', { p_kind: kind, p_id: id, p_emoji: emoji }),
  reactions: (kind: 'poll' | 'list', id: string) => rpc<Reactions>('reactions_get', { p_kind: kind, p_id: id }),
  createSwipe: (code: string, productIds: string[]) => rpc<string>('swipe_create', { p_code: code, p_product_ids: productIds }),
  swipe: (id: string) => rpc<SwipeSession | null>('swipe_get', { p_id: id }),
  swipeVote: (id: string, productId: string, yes: boolean) => rpc<void>('swipe_vote', { p_id: id, p_product_id: productId, p_yes: yes }),
  swipes: () => rpc<SwipeSummary[]>('swipe_list'),
  deleteSwipe: (id: string) => rpc<void>('swipe_delete', { p_id: id }),
  createSanta: (theme: SantaTheme, budget: number | null, exchangeOn: string | null) =>
    rpc<string>('santa_create', { p_theme: theme, p_budget: budget, p_exchange_on: exchangeOn }),
  santa: (id: string) => rpc<SantaGroup | null>('santa_get', { p_id: id }),
  santas: () => rpc<SantaSummary[]>('santa_list'),
  santaJoin: (id: string) => rpc<void>('santa_join', { p_id: id }),
  /** code null: esco io; altrimenti l'organizzatore toglie quella persona */
  santaLeave: (id: string, code: string | null) => rpc<void>('santa_leave', { p_id: id, p_code: code }),
  santaSet: (id: string, listId: string | null, ready: boolean) => rpc<void>('santa_set', { p_id: id, p_list_id: listId, p_ready: ready }),
  santaDraw: (id: string) => rpc<void>('santa_draw', { p_id: id }),
  santaInvite: (id: string, codes: string[]) => rpc<number>('santa_invite', { p_id: id, p_codes: codes }),
  deleteSanta: (id: string) => rpc<void>('santa_delete', { p_id: id }),
  createChallenge: (codes: string[], productIds: string[]) => rpc<string>('challenge_create', { p_codes: codes, p_product_ids: productIds }),
  challenge: (id: string) => rpc<PriceChallenge | null>('challenge_get', { p_id: id }),
  challengePlay: (id: string, score: number) => rpc<void>('challenge_play', { p_id: id, p_score: score }),
  challenges: () => rpc<PriceChallengeSummary[]>('challenge_list'),
  deleteChallenge: (id: string) => rpc<void>('challenge_delete', { p_id: id }),
}

/** Sfida "Indovina il prezzo" (supabase/schema-15.sql) */
export interface PriceChallenge {
  id: string
  product_ids: string[]
  created_at: string
  is_creator: boolean
  creator: SocialCard
  my_score: number | null
  invited: number
  /** Classifica: solo dopo aver giocato */
  players: (SocialCard & { score: number; me: boolean })[] | null
}
export interface PriceChallengeSummary {
  id: string
  created_at: string
  product_ids: string[]
  is_creator: boolean
  creator: SocialCard
  my_score: number | null
  played: number
}

/** Amici a cui mandare cose: chi seguo e chi mi segue, senza doppioni. */
export async function friendList(): Promise<SocialCard[]> {
  const { following, followers } = await social.friends()
  const byCode = new Map([...following, ...followers].map((f) => [f.code, f]))
  return [...byCode.values()]
}

// --- Notifiche "Per te": quante cose nuove (pallino sulla scheda Amici) ---
let unseen = 0
const listeners = new Set<(n: number) => void>()
export function setUnseen(n: number) {
  unseen = n
  for (const l of listeners) l(n)
}
export async function refreshUnseen() {
  try {
    setUnseen(await social.inboxUnseen())
  } catch {
    /* senza rete o senza account: niente pallino */
  }
}
export function subscribeUnseen(l: (n: number) => void) {
  listeners.add(l)
  l(unseen)
  return () => void listeners.delete(l)
}

// --- Link ---
const SITE = 'https://swipeshopping.app/'
export const profileUrl = (code: string) => `${SITE}#/u/${code}`
export const pollUrl = (id: string) => `${SITE}#/sondaggio/${id}`
export const giftListUrl = (id: string) => `${SITE}#/regalo/${id}`
export const santaUrl = (id: string) => `${SITE}#/segreto/${id}`

export const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

/** Parte dell'indirizzo dopo #/<prefisso>/ (es. il codice di #/u/abc). */
export function hashParam(prefix: string, hash = window.location.hash) {
  const m = hash.match(new RegExp(`^#/?${prefix}/([A-Za-z0-9-]+)`))
  return m ? m[1] : null
}

/** Pannello di condivisione del telefono; dove non c'è copia il link. */
export async function shareLink(text: string, url: string): Promise<'shared' | 'copied' | 'cancelled'> {
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Swipe Shopping', text, url })
      return 'shared'
    } catch {
      return 'cancelled'
    }
  }
  await navigator.clipboard?.writeText(`${text}\n${url}`)
  return 'copied'
}

/** "2 ore fa", "ieri", "3 giorni fa" */
export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min fa`
  if (s < 86400) return Math.round(s / 3600) === 1 ? '1 ora fa' : `${Math.round(s / 3600)} ore fa`
  const d = Math.round(s / 86400)
  return d === 1 ? 'ieri' : `${d} giorni fa`
}
