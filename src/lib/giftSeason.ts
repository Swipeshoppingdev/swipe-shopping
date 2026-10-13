// Fuori da GiftsPage: lo usano header e tema all'avvio, così la pagina Regali si scarica solo quando si apre.
export type GiftSeason = { id: 'regali' | 'halloween'; title: string; emoji: string; hint: string; deals: boolean }

/**
 * Titolo del periodo: Halloween dal 20 al 31 ottobre (mazzo a tema arancione), Black Friday dal 20 novembre
 * al Cyber Monday, poi Natale fino al 24 dicembre. Per un nuovo evento: un periodo qui, le ricerche in
 * scripts/search-plan.ts (con months) e i colori in index.css.
 */
export function giftSeason(now = new Date()): GiftSeason {
  const m = now.getMonth() + 1
  const d = now.getDate()
  const gifts = { id: 'regali' as const, emoji: '🎄' }
  if (m === 10 && d >= 20) return { id: 'halloween', title: 'Halloween', emoji: '🎃', hint: 'Costumi, decorazioni, trucchi e dolcetti', deals: false }
  if ((m === 11 && d >= 20) || (m === 12 && d <= 1)) return { ...gifts, title: 'Black Friday', hint: 'Le offerte più forti di tutte le sezioni', deals: true }
  if (m === 12 && d <= 24) return { ...gifts, title: 'Regali di Natale', hint: 'Idee regalo per tutti, per budget', deals: false }
  if (m === 11 || m === 10) return { ...gifts, title: 'Idee regalo', hint: 'Black Friday e Natale: inizia a salvare le idee', deals: false }
  return { ...gifts, title: 'Idee regalo', hint: 'Regali per tutti, per budget', deals: false }
}
