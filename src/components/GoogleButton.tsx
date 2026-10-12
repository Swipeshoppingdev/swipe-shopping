import { useEffect, useRef, useState, type ReactNode } from 'react'
import { GOOGLE_CLIENT_ID } from '../config/app'
import { isNative } from '../lib/native'
import { useAuth } from '../state/AuthState'

type Gsi = {
  accounts: {
    id: {
      initialize: (o: Record<string, unknown>) => void
      renderButton: (el: HTMLElement, o: Record<string, unknown>) => void
    }
  }
}

let gsiPromise: Promise<Gsi> | null = null

/** Script ufficiale "Accedi con Google", caricato solo quando serve. */
function loadGsi(): Promise<Gsi> {
  gsiPromise ??= new Promise<Gsi>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => {
      const g = (window as unknown as { google?: Gsi }).google
      if (g?.accounts?.id) resolve(g)
      else reject(new Error('gsi'))
    }
    s.onerror = () => reject(new Error('gsi'))
    document.head.appendChild(s)
  }).catch((e) => {
    gsiPromise = null
    throw e
  })
  return gsiPromise
}

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Pulsante ufficiale di Google (solo sul sito): la finestra dice "Accedi a swipeshopping.app".
 * Google ci dà un token che passiamo a Supabase (signInWithIdToken), senza passare dal suo indirizzo.
 * Se lo script di Google non si carica (o nell'app) mostra `fallback`, cioè il vecchio pulsante.
 */
export function GoogleButton({ fallback, onError }: { fallback: ReactNode; onError: (msg: string) => void }) {
  const auth = useAuth()
  const box = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  const usable = !isNative && !!GOOGLE_CLIENT_ID && !!crypto?.subtle

  useEffect(() => {
    if (!usable) return
    let cancelled = false
    ;(async () => {
      try {
        const google = await loadGsi()
        const nonce = crypto.randomUUID()
        const hashed = await sha256Hex(nonce)
        if (cancelled || !box.current) return
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          nonce: hashed,
          ux_mode: 'popup',
          itp_support: true,
          callback: ({ credential }: { credential?: string }) => {
            if (!credential) return
            auth.signInWithGoogleToken(credential, nonce).catch((e: unknown) =>
              onError(e instanceof Error ? e.message : 'Qualcosa è andato storto.'),
            )
          },
        })
        google.accounts.id.renderButton(box.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          logo_alignment: 'center',
          locale: 'it',
          width: Math.min(400, Math.max(200, box.current.offsetWidth)),
        })
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [usable])

  if (!usable || failed) return <>{fallback}</>
  return <div ref={box} className="flex min-h-11 w-full justify-center" />
}
