import { Capacitor } from '@capacitor/core'
import { isNative } from './native'
import { load, remove, save } from './storage'
import { supabase } from './supabase'

/**
 * Notifiche push nell'app Android (Firebase Cloud Messaging). Le manda scripts/push.ts quando un amico
 * ti manda qualcosa in "Per te", e scripts/price-alerts.ts quando un preferito è in offerta. Attive solo se l'app è stata costruita con google-services.json
 * (android.yml imposta VITE_PUSH=1).
 */
export const pushAvailable = isNative && Capacitor.getPlatform() === 'android' && import.meta.env.VITE_PUSH === '1'

const TOKEN_KEY = 'pushToken'
let listening = false

async function plugin() {
  return (await import('@capacitor/push-notifications')).PushNotifications
}

/** Permesso già dato (o negato) dall'utente. */
export async function pushPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  if (!pushAvailable) return 'denied'
  const { receive } = await (await plugin()).checkPermissions()
  return receive === 'granted' ? 'granted' : receive === 'denied' ? 'denied' : 'prompt'
}

/** Ascolta token e tocchi sulle notifiche (una volta sola). */
async function listen() {
  if (listening) return
  listening = true
  const push = await plugin()
  // Canale delle notifiche (lo stesso indicato in AndroidManifest.xml).
  await push.createChannel({ id: 'amici', name: 'Amici', description: 'Consigli, sondaggi e liste dai tuoi amici', importance: 4 }).catch(() => {})
  await push.createChannel({ id: 'offerte', name: 'Offerte sui preferiti', description: 'Quando un tuo preferito è scontato (al massimo ogni 3 giorni)', importance: 3 }).catch(() => {})
  await push.addListener('registration', ({ value }) => {
    save(TOKEN_KEY, value)
    // .then() fa partire davvero la richiesta.
    void supabase?.rpc('push_register', { p_token: value, p_platform: 'android' }).then(({ error }) => error && console.warn(error.message))
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
  if (!pushAvailable) return false
  const push = await plugin()
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
  await supabase?.rpc('push_unregister', { p_token: token })
  if (pushAvailable) await (await plugin()).unregister().catch(() => {})
}

export const pushEnabledHere = () => pushAvailable && !!load<string | null>(TOKEN_KEY, null)
