import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { APP_AUTH_URL, isNative } from '../lib/native'
import { disablePush } from '../lib/push'
import { authRedirectUrl, supabase } from '../lib/supabase'

/** Messaggi d'errore di Supabase tradotti in italiano semplice. */
function friendlyError(message: string) {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Email o password non corretti.'
  if (m.includes('email not confirmed')) return "Conferma prima l'email: ti abbiamo mandato un link."
  if (m.includes('already registered')) return 'Esiste già un account con questa email. Prova ad accedere.'
  if (m.includes('password should be at least')) return 'La password deve avere almeno 8 caratteri.'
  if (m.includes('rate limit')) return 'Troppi tentativi. Riprova tra qualche minuto.'
  if (m.includes('sending') && m.includes('email')) return "Non siamo riusciti a inviare l'email. Riprova tra qualche minuto."
  if (m.includes('provider is not enabled') || m.includes('unsupported provider')) return "L'accesso con Google non è ancora attivo."
  if (m.includes('invalid email') || m.includes('unable to validate email')) return "L'indirizzo email non è valido."
  return message
}

async function run(fn: () => Promise<{ error: { message: string } | null }>) {
  const { error } = await fn()
  if (error) throw new Error(friendlyError(error.message))
}

/**
 * Registrazione in attesa di conferma: la password resta solo in memoria per un po'.
 * Quando l'utente conferma l'email (spesso nel browser, fuori dall'app) e torna qui, entriamo da soli
 * invece di chiedergli di accedere di nuovo.
 */
let pendingSignup: { email: string; password: string; until: number } | null = null
const PENDING_MS = 30 * 60_000

function useAutoLoginAfterConfirm(loggedIn: boolean) {
  useEffect(() => {
    if (!supabase || loggedIn) return
    let busy = false
    const tryLogin = async () => {
      const p = pendingSignup
      if (!p || busy || document.visibilityState !== 'visible') return
      if (Date.now() > p.until) {
        pendingSignup = null
        return
      }
      busy = true
      // Finché l'email non è confermata Supabase risponde con un errore: riproviamo più tardi.
      const { error } = await supabase!.auth.signInWithPassword({ email: p.email, password: p.password })
      if (!error) pendingSignup = null
      busy = false
    }
    document.addEventListener('visibilitychange', tryLogin)
    window.addEventListener('focus', tryLogin)
    // Anche senza uscire dall'app (conferma da un altro dispositivo).
    const timer = window.setInterval(tryLogin, 10_000)
    return () => {
      document.removeEventListener('visibilitychange', tryLogin)
      window.removeEventListener('focus', tryLogin)
      window.clearInterval(timer)
    }
  }, [loggedIn])
}

/**
 * Nell'app: il link dell'email (conferma o password dimenticata) riapre l'app con ?code=...,
 * che scambiamo con la sessione. Funziona perché la registrazione è partita da qui (PKCE).
 */
function useAppAuthLinks(onError: (message: string) => void) {
  useEffect(() => {
    if (!supabase || !isNative) return
    let remove: (() => void) | undefined
    let cancelled = false
    const handle = async (url: string | undefined) => {
      if (!url?.startsWith(APP_AUTH_URL)) return
      // Ritorno dall'accesso con Google: chiudiamo la pagina di Google se è ancora aperta.
      void import('@capacitor/browser').then(({ Browser }) => Browser.close()).catch(() => {})
      // Si apre il Profilo: lì si vede l'accesso fatto, il modulo per la nuova password o l'errore.
      window.location.hash = '#/profilo'
      // Parametri sia dopo ? sia dopo # (Supabase mette gli errori nel #).
      const params = new URLSearchParams(url.slice(APP_AUTH_URL.length).replace(/^[/?#]+/, '').replace('#', '&'))
      const code = params.get('code')
      const err = params.get('error_description')
      if (code) {
        const { error } = await supabase!.auth.exchangeCodeForSession(code)
        if (!error) pendingSignup = null
        else onError(friendlyError(error.message))
      } else if (err) {
        // Mai il testo del link così com'è: chiunque può aprire app.swipeshopping://auth con un messaggio inventato.
        onError(/expired|invalid/i.test(err) ? 'Il link è scaduto o già usato. Prova ad accedere.' : 'Accesso non riuscito. Riprova.')
      }
    }
    void import('@capacitor/app').then(async ({ App }) => {
      if (cancelled) return
      const sub = await App.addListener('appUrlOpen', ({ url }) => void handle(url))
      remove = () => void sub.remove()
      if (cancelled) remove()
      // App chiusa: il link la apre da zero.
      void handle((await App.getLaunchUrl())?.url)
    })
    return () => {
      cancelled = true
      remove?.()
    }
  }, [onError])
}

function useAuthStore() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!supabase)
  /** true quando l'utente arriva dal link "password dimenticata" */
  const [recovering, setRecovering] = useState(false)
  /** errore del link email aperto nell'app (es. link scaduto) */
  const [linkError, setLinkError] = useState('')

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
    })
    // Togliamo ?code=... dall'indirizzo dopo il ritorno dal link email.
    if (window.location.search.includes('code=')) {
      window.history.replaceState(null, '', authRedirectUrl() + window.location.hash)
    }
    return () => data.subscription.unsubscribe()
  }, [])

  useAutoLoginAfterConfirm(!!session)
  useAppAuthLinks(setLinkError)

  return useMemo(
    () => ({
      enabled: !!supabase,
      ready,
      user: session?.user ?? null,
      recovering,
      linkError,
      signUp: async (email: string, password: string, emailNews: boolean) => {
        await run(() =>
          supabase!.auth.signUp({
            email,
            password,
            // Copiata in user_data.email_news da un trigger (supabase/schema-3.sql).
            options: { emailRedirectTo: authRedirectUrl(), data: { email_news: emailNews } },
          }),
        )
        pendingSignup = { email, password, until: Date.now() + PENDING_MS }
      },
      /**
       * Accesso (o registrazione) con Google. Sul sito si va su Google e si torna qui con ?code=.
       * Nell'app Google si apre nel browser e torna all'app con app.swipeshopping://auth?code= (useAppAuthLinks).
       */
      signInWithGoogle: async () => {
        if (!isNative) {
          return run(() => supabase!.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: authRedirectUrl() } }))
        }
        const { data, error } = await supabase!.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: APP_AUTH_URL, skipBrowserRedirect: true },
        })
        if (error || !data.url) throw new Error(friendlyError(error?.message ?? 'Qualcosa è andato storto.'))
        const { Browser } = await import('@capacitor/browser')
        await Browser.open({ url: data.url })
      },
      /** Accesso con il token del pulsante ufficiale di Google (solo sito, vedi GoogleButton). */
      signInWithGoogleToken: (token: string, nonce: string) =>
        run(() => supabase!.auth.signInWithIdToken({ provider: 'google', token, nonce })),
      signIn: (email: string, password: string) => run(() => supabase!.auth.signInWithPassword({ email, password })),
      signOut: async () => {
        pendingSignup = null
        // Questo telefono non riceve più le notifiche di questo account.
        await disablePush(false).catch(() => {})
        return run(() => supabase!.auth.signOut())
      },
      resetPassword: (email: string) =>
        run(() => supabase!.auth.resetPasswordForEmail(email, { redirectTo: authRedirectUrl() })),
      updatePassword: async (password: string) => {
        await run(() => supabase!.auth.updateUser({ password }))
        setRecovering(false)
      },
      deleteAccount: async () => {
        await run(async () => supabase!.rpc('delete_my_account'))
        await supabase!.auth.signOut()
      },
    }),
    [session, ready, recovering, linkError],
  )
}

type Auth = ReturnType<typeof useAuthStore>
const Ctx = createContext<Auth | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuthStore()
  return <Ctx.Provider value={auth}>{children}</Ctx.Provider>
}

// oxlint-disable-next-line react/only-export-components -- hook e provider stanno insieme
export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth va usato dentro AuthProvider')
  return ctx
}
