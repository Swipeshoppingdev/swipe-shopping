import { isNative } from './native'

const KEY = 'reviewAsk'
const DAY = 86_400_000

/**
 * Richiesta di recensione nell'app (la finestra ufficiale di iPhone e Android, non una nostra):
 * dopo 25 Sì in almeno 3 giorni diversi di uso, poi al massimo ogni 120 giorni.
 * Il sistema decide se mostrarla davvero (iPhone al massimo 3 volte l'anno), quindi niente messaggi nostri.
 */
export function countLikeForReview() {
  if (!isNative) return
  let ready = false
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { likes?: number; days?: string[]; askedAt?: number }
    const today = new Date().toISOString().slice(0, 10)
    s.likes = (s.likes ?? 0) + 1
    s.days = [...new Set([...(s.days ?? []), today])].slice(-3)
    ready = s.likes >= 25 && s.days.length >= 3 && Date.now() - (s.askedAt ?? 0) > 120 * DAY
    if (ready) {
      s.askedAt = Date.now()
      s.likes = 0
    }
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    return
  }
  // Un attimo dopo lo swipe, quando la carta è già volata via.
  if (ready) {
    setTimeout(() => {
      import('@capacitor-community/in-app-review').then(({ InAppReview }) => InAppReview.requestReview()).catch(() => {})
    }, 1200)
  }
}
