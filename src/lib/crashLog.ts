import { load, save } from './storage'

/** Ultimi errori dell'app salvati sul telefono: l'admin li vede in Profilo (per capire i bug segnalati dai tester). */
export type CrashEntry = { at: string; where: string; message: string; stack?: string; route: string; ua: string }

const KEY = 'crashLog'
const MAX = 5

export function logCrash(where: string, err: unknown, extra?: string) {
  try {
    const e = err instanceof Error ? err : new Error(String(err))
    const entry: CrashEntry = {
      at: new Date().toISOString(),
      where,
      message: e.message.slice(0, 300),
      stack: `${e.stack ?? ''}${extra ? `\n--\n${extra}` : ''}`.slice(0, 1500),
      route: location.hash,
      ua: navigator.userAgent.slice(0, 200),
    }
    save(KEY, [entry, ...load<CrashEntry[]>(KEY, [])].slice(0, MAX))
  } catch {
    // Mai un errore mentre si salva un errore.
  }
}

export const crashLog = () => load<CrashEntry[]>(KEY, [])
export const clearCrashLog = () => save(KEY, [])

/** Anche gli errori fuori da React (timer, promesse). */
export function watchErrors() {
  window.addEventListener('error', (e) => logCrash('window', e.error ?? e.message))
  window.addEventListener('unhandledrejection', (e) => logCrash('promise', e.reason))
}
