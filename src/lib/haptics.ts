import { isNative } from './native'

/**
 * Vibrazione leggerissima quando si mette Sì (Kevin: "molto leggera e solo ai Sì"): nell'app il tocco leggero
 * del sistema (anche su iPhone), nel sito su Android 10 ms. Nessun'altra vibrazione nell'app.
 */
export function likeTap() {
  if (!isNative) {
    navigator.vibrate?.(10)
    return
  }
  void haptics().then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light })).catch(() => {})
}

let mod: Promise<typeof import('@capacitor/haptics')> | null = null
const haptics = () => (mod ??= import('@capacitor/haptics'))
// Pronto prima del primo Sì: il tocco arriva insieme allo swipe, non dopo.
if (isNative) setTimeout(() => void haptics().catch(() => {}), 3000)
