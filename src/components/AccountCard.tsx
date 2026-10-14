import { CheckCircle2, CloudOff, Loader2, LogOut, Mail, Trash2, UserRound } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Captcha } from './Captcha'
import { GoogleButton } from './GoogleButton'
import { EmailAlertsToggle, EmailNewsToggle } from './EmailAlertsToggle'
import { PushToggle } from './PushToggle'
import { FEATURES } from '../config/app'
import { isIOSApp } from '../lib/native'
import { useApp, type SyncStatus } from '../state/AppState'
import { useAuth } from '../state/AuthState'

type Mode = 'accedi' | 'registrati' | 'recupera'

const SYNC_LABEL: Record<SyncStatus, ReactNode> = {
  off: null,
  loading: (
    <>
      <Loader2 className="size-4 animate-spin" /> Recupero i tuoi dati…
    </>
  ),
  saving: (
    <>
      <Loader2 className="size-4 animate-spin" /> Salvataggio…
    </>
  ),
  synced: (
    <>
      <CheckCircle2 className="size-4 text-emerald-600" /> Dati salvati nel tuo account
    </>
  ),
  error: (
    <>
      <CloudOff className="size-4 text-rose-600" /> Salvataggio non riuscito, riproverò alla prossima modifica
    </>
  ),
}

/** Accesso, registrazione e gestione dell'account (Supabase). */
export function AccountCard({ children }: { children?: ReactNode }) {
  const auth = useAuth()
  const { sync } = useApp()

  if (!auth.enabled) {
    return (
      <>
        <p className="text-sm text-neutral-600">
          Per ora preferiti e filtri restano salvati su questo dispositivo. Account e sincronizzazione arriveranno presto.
        </p>
        {children}
      </>
    )
  }
  if (!auth.ready) return <p className="text-sm text-neutral-500">Caricamento…</p>
  if (auth.recovering) return <NewPasswordForm />
  if (auth.user) {
    return (
      <LoggedIn email={auth.user.email ?? ''} sync={sync}>
        {children}
      </LoggedIn>
    )
  }
  return (
    <>
      <p className="mb-3 text-sm text-neutral-600">Crea un account gratuito per non perdere i preferiti e ritrovarli su ogni dispositivo.</p>
      <AuthForm />
      {children}
    </>
  )
}

function LoggedIn({ email, sync, children }: { email: string; sync: SyncStatus; children?: ReactNode }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="flex items-center gap-2">
        <UserRound className="size-4 text-neutral-500" />
        <span className="truncate font-medium">{email}</span>
      </p>
      {SYNC_LABEL[sync] && <p className="flex items-center gap-2 text-neutral-600">{SYNC_LABEL[sync]}</p>}
      <EmailAlertsToggle />
      <PushToggle plain />
      <EmailNewsToggle />
      {children}
    </div>
  )
}

/** "Esci" ed "Elimina account" (in fondo, dopo `children`): nell'ultimo riquadro del Profilo, solo con un account. */
export function AccountActions({ children }: { children?: ReactNode }) {
  const auth = useAuth()
  const { actions } = useApp()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!auth.user) return null
  const onSignOut = async () => {
    await auth.signOut()
    actions.clearAll()
  }
  const onDelete = async () => {
    await auth.deleteAccount()
    actions.clearAll()
  }
  const act = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Qualcosa è andato storto.')
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      {error && <p className="text-rose-600">{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={() => act(onSignOut)}
        className="inline-flex items-center gap-2 text-left font-medium disabled:opacity-40"
      >
        <LogOut className="size-4" /> Esci
      </button>
      {children}
      {confirmDelete ? (
        <div className="flex flex-wrap items-center gap-2">
          <span>Eliminare l'account e tutti i dati salvati?</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => act(onDelete)}
            className="rounded-full bg-rose-600 px-3 py-1 font-semibold text-[#fff] disabled:opacity-40"
          >
            Sì, elimina
          </button>
          <button type="button" onClick={() => setConfirmDelete(false)} className="px-2 py-1 font-medium text-neutral-500">
            Annulla
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-2 text-left font-medium text-rose-600">
          <Trash2 className="size-4" /> Elimina account
        </button>
      )}
    </div>
  )
}

/** "Password dimenticata": al massimo 3 link all'ora da questo dispositivo (Supabase ne limita anche per indirizzo). */
const MAX_RESETS = 3
const RESETS_KEY = 'resetRequests'
const recentResets = (): number[] => {
  try {
    const list = JSON.parse(localStorage.getItem(RESETS_KEY) ?? '[]') as unknown
    return Array.isArray(list) ? list.filter((t): t is number => typeof t === 'number' && Date.now() - t < 3_600_000) : []
  } catch {
    return []
  }
}
const resetsLeft = () => MAX_RESETS - recentResets().length
const noteReset = () => {
  try {
    localStorage.setItem(RESETS_KEY, JSON.stringify([...recentResets(), Date.now()]))
  } catch {
    // Senza memoria del browser resta solo il limite di Supabase.
  }
}

export function AuthForm({ initialMode = 'accedi' }: { initialMode?: Mode }) {
  const auth = useAuth()
  const [mode, setMode] = useState<Mode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [news, setNews] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const google = async () => {
    setBusy(true)
    setError('')
    try {
      await auth.signInWithGoogle()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Qualcosa è andato storto.')
    } finally {
      setBusy(false)
    }
  }

  const apple = async () => {
    setBusy(true)
    setError('')
    try {
      await auth.signInWithApple()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Qualcosa è andato storto.')
    } finally {
      setBusy(false)
    }
  }

  const switchMode = (m: Mode) => {
    setMode(m)
    setError('')
    setInfo('')
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setInfo('')
    try {
      if (mode === 'accedi') await auth.signIn(email.trim(), password)
      if (mode === 'registrati') {
        await auth.signUp(email.trim(), password, news)
        setInfo(`Ti abbiamo mandato un'email a ${email.trim()}: apri il link per confermare l'account. Poi torna qui: entri in automatico.`)
      }
      if (mode === 'recupera') {
        const left = resetsLeft()
        if (left <= 0) {
          setError(`Hai già chiesto ${MAX_RESETS} link nell'ultima ora. Controlla la posta (anche lo Spam) o riprova più tardi.`)
          return
        }
        await auth.resetPassword(email.trim())
        noteReset()
        setInfo("Se l'email è registrata riceverai un link per scegliere una nuova password.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Qualcosa è andato storto.')
    } finally {
      setBusy(false)
    }
  }

  // App iPhone: Apple vuole "Accedi con Apple" accanto a Google, quindi Google c'è solo se c'è anche Apple.
  const showApple = isIOSApp && FEATURES.appleLogin
  const showGoogle = FEATURES.googleLogin && (!isIOSApp || showApple)
  const showSocial = showApple || showGoogle

  const input = 'w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-base outline-none focus:border-neutral-900'

  return (
    <form onSubmit={submit} className="space-y-3 text-sm">
      {mode !== 'recupera' && (
        <div className="grid grid-cols-2 rounded-full bg-neutral-100 p-1 font-medium">
          {(['accedi', 'registrati'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={`rounded-full py-1.5 ${mode === m ? 'bg-white shadow-sm' : 'text-neutral-500'}`}
            >
              {m === 'accedi' ? 'Accedi' : 'Registrati'}
            </button>
          ))}
        </div>
      )}
      {showSocial && mode !== 'recupera' && (
        <>
          {showApple && (
            <button
              type="button"
              onClick={apple}
              disabled={busy}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#000] font-semibold text-[#fff] disabled:opacity-50"
            >
              <AppleLogo />
              Continua con Apple
            </button>
          )}
          {showGoogle && (
            <GoogleButton
              onError={setError}
              fallback={
                <button
                  type="button"
                  onClick={google}
                  disabled={busy}
                  className="flex h-11 w-full items-center justify-center gap-2.5 rounded-full border border-neutral-300 bg-white font-semibold text-neutral-800 disabled:opacity-50"
                >
                  <GoogleLogo />
                  Continua con Google
                </button>
              }
            />
          )}
          <div className="flex items-center gap-3 text-xs text-neutral-400">
            <span className="h-px flex-1 bg-neutral-200" />
            oppure con email
            <span className="h-px flex-1 bg-neutral-200" />
          </div>
        </>
      )}
      {mode === 'recupera' && <p className="text-neutral-600">Inserisci la tua email: ti mandiamo un link per reimpostare la password.</p>}
      <input
        type="email"
        required
        autoComplete="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={input}
      />
      {mode !== 'recupera' && (
        <input
          type="password"
          required
          // Chi ha già un account con 6-7 caratteri deve poter ancora entrare; i nuovi ne mettono almeno 8.
          minLength={mode === 'accedi' ? 6 : 8}
          autoComplete={mode === 'accedi' ? 'current-password' : 'new-password'}
          placeholder={mode === 'accedi' ? 'Password' : 'Password (almeno 8 caratteri)'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={input}
        />
      )}
      {mode === 'registrati' && (
        <label className="flex items-start gap-2.5 px-1 text-neutral-600">
          <input type="checkbox" checked={news} onChange={(e) => setNews(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-neutral-900" />
          <span>Voglio ricevere via email le novità di Swipe Shopping. Puoi cambiare idea quando vuoi dal Profilo.</span>
        </label>
      )}
      {mode === 'registrati' && (
        <p className="px-1 text-xs text-neutral-500">
          Registrandoti{showGoogle ? (showApple ? ' (anche con Apple o Google)' : ' (anche con Google)') : ''} confermi di avere almeno 14 anni.
        </p>
      )}
      {(error || auth.linkError) && <p className="text-rose-600">{error || auth.linkError}</p>}
      {info && (
        <p className="flex gap-2 rounded-xl bg-emerald-50 p-3 text-emerald-800">
          <Mail className="mt-0.5 size-4 shrink-0" />
          {info}
        </p>
      )}
      <Captcha />
      <button
        type="submit"
        disabled={busy}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-neutral-900 font-semibold text-white disabled:opacity-50"
      >
        {busy && <Loader2 className="size-4 animate-spin" />}
        {mode === 'accedi' ? 'Accedi' : mode === 'registrati' ? 'Crea account' : 'Invia link'}
      </button>
      <button
        type="button"
        onClick={() => switchMode(mode === 'recupera' ? 'accedi' : 'recupera')}
        className="w-full text-center font-medium text-neutral-500"
      >
        {mode === 'recupera' ? "Torna all'accesso" : 'Password dimenticata?'}
      </button>
    </form>
  )
}

/** La "G" di Google, come chiedono le loro linee guida per il pulsante di accesso. */
function AppleLogo() {
  return (
    <svg viewBox="0 0 17 20" className="size-[18px]" fill="currentColor" aria-hidden="true">
      <path d="M14.06 10.62c-.02-2.33 1.9-3.45 1.99-3.5-1.08-1.59-2.77-1.8-3.37-1.83-1.43-.15-2.8.84-3.53.84-.73 0-1.85-.82-3.04-.8-1.56.02-3 .91-3.81 2.31-1.62 2.82-.41 7 1.17 9.29.77 1.12 1.69 2.38 2.9 2.33 1.16-.05 1.6-.75 3.01-.75 1.4 0 1.8.75 3.03.73 1.25-.02 2.04-1.14 2.81-2.27.88-1.3 1.25-2.56 1.27-2.62-.03-.01-2.42-.93-2.43-3.73zM11.76 3.78c.64-.78 1.08-1.86.96-2.94-.93.04-2.05.62-2.71 1.4-.6.69-1.12 1.79-.98 2.85 1.03.08 2.09-.53 2.73-1.31z" />
    </svg>
  )
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

function NewPasswordForm() {
  const auth = useAuth()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await auth.updatePassword(password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Qualcosa è andato storto.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-sm">
      <p className="text-neutral-600">Scegli una nuova password per il tuo account.</p>
      <input
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
        placeholder="Nuova password (almeno 8 caratteri)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-base outline-none focus:border-neutral-900"
      />
      {error && <p className="text-rose-600">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-neutral-900 font-semibold text-white disabled:opacity-50"
      >
        {busy && <Loader2 className="size-4 animate-spin" />}
        Salva password
      </button>
    </form>
  )
}
