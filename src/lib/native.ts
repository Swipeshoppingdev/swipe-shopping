import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core'

/** true dentro l'app Android/iOS (Capacitor), false nel sito. */
export const isNative = Capacitor.isNativePlatform()
/** true solo nell'app iPhone. */
export const isIOSApp = isNative && Capacitor.getPlatform() === 'ios'

/** Il sito: da qui l'app scarica catalogo e dettagli sempre aggiornati, e qui tornano i link delle email. */
export const SITE = 'https://swipeshopping.app/'

/** Indirizzo che apre direttamente l'app (dichiarato in AndroidManifest.xml): qui tornano i link delle email. */
export const APP_AUTH_URL = 'app.swipeshopping://auth'

/** Dove leggere i dati (catalogo, dettagli): nel sito accanto alla pagina, nell'app dal sito online. */
export const DATA_BASE = isNative ? SITE : import.meta.env.BASE_URL

/** Colore del testo nella barra di stato (ora, batteria) in base al tema dell'app. */
export function setSystemBarsTheme(dark: boolean) {
  if (!isNative) return
  SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {})
}

/**
 * Comportamenti da app: i link ai negozi si aprono nel browser (Chrome/Safari) e non dentro l'app,
 * il tasto Indietro di Android torna alla pagina precedente o chiude l'app.
 */
export async function setupNative() {
  if (!isNative) return
  const [{ App }, { Browser }, { SplashScreen }] = await Promise.all([
    import('@capacitor/app'),
    import('@capacitor/browser'),
    import('@capacitor/splash-screen'),
  ])

  document.addEventListener(
    'click',
    (e) => {
      if (e.defaultPrevented) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a) return
      const url = new URL(a.href, window.location.href)
      if (url.origin === window.location.origin) {
        // Link interni con target="_blank" (es. Privacy): nell'app si apre la pagina, senza nuove finestre.
        if (a.target === '_blank') {
          e.preventDefault()
          window.location.hash = url.hash
        }
        return
      }
      if (!/^https?:$/.test(url.protocol)) return
      e.preventDefault()
      void Browser.open({ url: url.href })
    },
    // Dopo gli altri gestori (es. il tracciamento del click sul negozio).
    false,
  )

  void App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back()
    else void App.exitApp()
  })

  void SplashScreen.hide()
}
