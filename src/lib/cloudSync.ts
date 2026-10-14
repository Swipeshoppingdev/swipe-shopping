import type { Filters } from '../types/product'
import { getSupabase } from './supabase'

export interface UserData {
  wishlist: { product: { id: string }; savedAt: number }[]
  disliked: string[]
  filters: Filters | null
}

export async function fetchUserData(userId: string): Promise<UserData | null> {
  const supabase = await getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('user_data')
    .select('wishlist, disliked, filters')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data as UserData | null
}

export async function saveUserData(userId: string, data: UserData) {
  const supabase = await getSupabase()
  if (!supabase) return
  const { error } = await supabase
    .from('user_data')
    .upsert({ user_id: userId, ...data, updated_at: new Date().toISOString() })
  if (error) throw error
}

/** Unisce i dati del dispositivo con quelli dell'account: nessun preferito va perso. */
export function mergeUserData<W extends UserData['wishlist'][number]>(
  local: { wishlist: W[]; disliked: string[]; filters: Filters },
  remote: UserData | null,
) {
  if (!remote) return local
  const byId = new Map<string, W>()
  for (const item of [...(remote.wishlist as W[]), ...local.wishlist]) {
    const existing = byId.get(item.product.id)
    if (!existing || item.savedAt < existing.savedAt) byId.set(item.product.id, item)
  }
  const wishlist = [...byId.values()].sort((a, b) => b.savedAt - a.savedAt)
  const liked = new Set(wishlist.map((w) => w.product.id))
  const disliked = [...new Set([...remote.disliked, ...local.disliked])].filter((id) => !liked.has(id))
  return { wishlist, disliked, filters: remote.filters ?? local.filters }
}
