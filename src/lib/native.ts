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
 * Apre un link fuori dall'app come farebbe il telefono: se è installata l'app del negozio (Amazon, Instagram…)
 * si apre quella, altrimenti il browser. Browser.open (Safari/Chrome dentro l'app) non apre mai le altre app.
 */
async function openOutside(url: string) {
  try {
    const { AppLauncher } = await import('@capacitor/app-launcher')
    if ((await AppLauncher.openUrl({ url })).completed) return
  } catch {
    // Plugin assente o errore: si usa il browser.
  }
  const { Browser } = await import('@capacitor/browser')
  await Browser.open({ url })
}

/**
 * Comportamenti da app: i link ai negozi si aprono nell'app del negozio se c'è (altrimenti nel browser),
 * il tasto Indietro di Android torna alla pagina precedente o chiude l'app.
 */
export async function setupNative() {
  if (!isNative) return
  const [{ App }, { SplashScreen }] = await Promise.all([
    import('@capacitor/app'),
    import('@capacitor/splash-screen'),
  ])

  // Il controllo si aggancia al link stesso: lì arriva prima che un elemento più in alto fermi il click
  // (la scheda prodotto lo fa) e dopo i gestori in cattura di React (la carta annulla il click dopo un trascinamento).
  const onLinkClick = (e: Event) => {
    const a = e.currentTarget as HTMLAnchorElement
    if (e.defaultPrevented) return
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
    // Gli altri gestori (es. il tracciamento del click sul negozio) partono lo stesso.
    e.preventDefault()
    void openOutside(url.href)
  }
  document.addEventListener(
    'click',
    (e) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (a) a.addEventListener('click', onLinkClick, { once: true })
    },
    true,
  )

  void App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back()
    else void App.exitApp()
  })

  void SplashScreen.hide()
  // Pronto in anticipo: il primo tocco su un link non aspetta il caricamento del plugin.
  void import('@capacitor/app-launcher').catch(() => {})
}
