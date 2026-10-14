import { Capacitor } from '@capacitor/core'
import { WEB_PUSH_KEY } from '../config/app'
import { isNative } from './native'
import { load, remove, save } from './storage'
import { getSupabase } from './supabase'

/**
 * Notifiche push. Le manda scripts/push.ts quando un amico ti manda qualcosa in "Per te",
 * scripts/price-alerts.ts quando un preferito è in offerta e scripts/brand-alerts.ts per le marche seguite.
 * - App Android: Firebase Cloud Messaging, solo se costruita con google-services.json (android.yml imposta VITE_PUSH=1).
 * - App iPhone: Apple Push (APNs) diretto, scripts/apns.ts. Il token si salva come "apns:<token>".
 * - Sito: Web Push standard (scripts/webpush.ts). Su iPhone solo col sito aggiunto alla schermata Home (iOS 16.4+).
 */
const androidPush = isNative && Capacitor.getPlatform() === 'android' && import.meta.env.VITE_PUSH === '1'
const webPush =
  !isNative && !!WEB_PUSH_KEY && typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
const iosPush = isNative && Capacitor.getPlatform() === 'ios'
export const pushAvailable = androidPush || iosPush || webPush

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
/** iPhone in Safari: le notifiche arrivano solo dopo aver aggiunto il sito alla schermata Home. */
export const pushNeedsInstall = !isNative && !!WEB_PUSH_KEY && /iphone|ipad|ipod/i.test(navigator.userAgent) && !isStandalone() && !webPush

const TOKEN_KEY = 'pushToken'
let listening = false

/** Il plugin va dentro un oggetto: restituito da solo da una funzione async, la Promise lo tratterebbe come
 *  "thenable" e chiamerebbe PushNotifications.then() (errore "not implemented on ios"). */
async function plugin() {
  const { PushNotifications } = await import('@capacitor/push-notifications')
  return { push: PushNotifications }
}

/** Permesso già dato (o negato) dall'utente. */
export async function pushPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  if (webPush) return Notification.permission === 'default' ? 'prompt' : Notification.permission
  if (!pushAvailable) return 'denied'
  const { receive } = await (await plugin()).push.checkPermissions()
  return receive === 'granted' ? 'granted' : receive === 'denied' ? 'denied' : 'prompt'
}

/** Ascolta token e tocchi sulle notifiche (una volta sola). */
async function listen() {
  if (listening) return
  listening = true
  const { push } = await plugin()
  // Canale delle notifiche (lo stesso indicato in AndroidManifest.xml).
  await push
    .createChannel({
      id: 'amici',
      name: 'Amici',
      description: 'Consigli, sondaggi e liste dai tuoi amici',
      importance: 4,
    })
    .catch(() => {})
  await push
    .createChannel({
      id: 'offerte',
      name: 'Offerte sui preferiti',
      description: 'Quando un tuo preferito è scontato (al massimo ogni 3 giorni)',
      importance: 3,
    })
    .catch(() => {})
  await push.addListener('registration', ({ value }) => {
    const token = iosPush ? `apns:${value}` : value
    save(TOKEN_KEY, token)
    // .then() fa partire davvero la richiesta.
    void getSupabase()
      .then((supabase) => supabase?.rpc('push_register', { p_token: token, p_platform: iosPush ? 'ios' : 'android' }))
      .then((res) => res?.error && console.warn(res.error.message))
  })
  await push.addListener('registrationError', (e) => console.warn('Notifiche non attive:', e.error))
  // Tocco sulla notifica: si apre la pagina giusta (es. #/sondaggio/…).
  await push.addListener('pushNotificationActionPerformed', ({ notification }) => {
    const url = (notification.data as { url?: string } | undefined)?.url
    if (url?.startsWith('#/')) window.location.hash = url
  })
}

/** Chiede il permesso (se serve) e registra il telefono. Ritorna true se le notifiche sono attive. */
export async function enablePush(): Promise<boolean> {
  if (webPush) return enableWebPush()
  if (!pushAvailable) return false
  const { push } = await plugin()
  let { receive } = await push.checkPermissions()
  if (receive === 'prompt' || receive === 'prompt-with-rationale') receive = (await push.requestPermissions()).receive
  if (receive !== 'granted') return false
  await listen()
  await push.register()
  save('pushOff', false)
  return true
}

/** All'avvio (con account): se il permesso c'è già, rinnova la registrazione (il token può cambiare). */
export async function resumePush() {
  if (!pushAvailable || load('pushOff', false)) return
  if ((await pushPermission()) === 'granted') await enablePush()
}

/** Spegne le notifiche per questo telefono (anche quando si esce dall'account). */
export async function disablePush(byUser = true) {
  const token = load<string | null>(TOKEN_KEY, null)
  if (byUser) save('pushOff', true)
  if (!token) return
  remove(TOKEN_KEY)
  await (await getSupabase())?.rpc('push_unregister', { p_token: token })
  if (webPush) await (await webSubscription())?.unsubscribe().catch(() => false)
  else if (pushAvailable) await (await plugin()).push.unregister().catch(() => {})
}

// ── Sito (Web Push) ──────────────────────────────────────────────────────────

/** Il service worker c'è solo nel sito pubblicato: senza, niente notifiche (non si aspetta per sempre). */
async function swReady() {
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 8000))])
}
async function webSubscription() {
  return (await swReady())?.pushManager.getSubscription() ?? null
}
const keyBytes = () => Uint8Array.from(atob(WEB_PUSH_KEY.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
const sameKey = (a: ArrayBuffer | null | undefined, b: Uint8Array) =>
  !!a && a.byteLength === b.length && new Uint8Array(a).every((x, i) => x === b[i])

async function enableWebPush() {
  // Prima cosa dopo il tocco: Safari chiede il permesso solo se la richiesta parte subito dal gesto.
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  if (permission !== 'granted') return false
  const reg = await swReady()
  if (!reg) return false
  const key = keyBytes()
  let sub = await reg.pushManager.getSubscription()
  // Abbonamento fatto con un'altra chiave: si rifà.
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe().catch(() => false)
    sub = null
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  const token = JSON.stringify(sub.toJSON())
  const old = load<string | null>(TOKEN_KEY, null)
  const supabase = await getSupabase()
  if (old && old !== token) await supabase?.rpc('push_unregister', { p_token: old })
  const res = await supabase?.rpc('push_register', { p_token: token, p_platform: 'web' })
  if (!res || res.error) {
    console.warn('Notifiche non attive:', res?.error?.message)
    return false
  }
  save(TOKEN_KEY, token)
  save('pushOff', false)
  return true
}

export const pushEnabledHere = () => pushAvailable && !!load<string | null>(TOKEN_KEY, null) && (!webPush || Notification.permission === 'granted')
