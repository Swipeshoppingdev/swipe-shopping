import { LazyMotion } from 'framer-motion'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'
import { watchErrors } from './lib/crashLog'
import { isNative, setupNative } from './lib/native'
import { startRemoteAnalytics } from './lib/remoteAnalytics'
import { cleanReloadParam, reloadForUpdate } from './lib/staleChunk'
import { AppStateProvider } from './state/AppState.tsx'
import { AuthProvider } from './state/AuthState.tsx'

cleanReloadParam()
const loadMotionFeatures = () => import('./lib/motionFeatures').then((m) => m.default)

watchErrors()
// Un pezzo dell'app non si carica perché il sito è stato aggiornato nel frattempo: si ricarica con i file nuovi.
// L'errore prosegue comunque (niente preventDefault, che farebbe arrivare a React un modulo vuoto: "reading 'default'"):
// loadChunk e il registro errori sanno che la pagina si sta ricaricando e non mostrano né salvano nulla.
window.addEventListener('vite:preloadError', () => {
  reloadForUpdate()
})
startRemoteAnalytics()
void setupNative()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {/* Il motore delle animazioni arriva in un file a parte: la prima carta si vede prima, le animazioni partono appena è scaricato. */}
      <LazyMotion features={loadMotionFeatures}>
        <AuthProvider>
          <AppStateProvider>
            <App />
          </AppStateProvider>
        </AuthProvider>
      </LazyMotion>
    </ErrorBoundary>
  </StrictMode>,
)

// App installabile (PWA): il service worker c'è solo nel sito pubblicato (non nell'app Android/iOS).
if (import.meta.env.PROD && !isNative && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
  // Tocco su una notifica con l'app già aperta: si va alla pagina indicata.
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent<{ type?: string; url?: string }>) => {
    if (e.data?.type === 'open' && e.data.url?.startsWith('#/')) window.location.hash = e.data.url
  })
}
