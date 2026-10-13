import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'
import { watchErrors } from './lib/crashLog'
import { isNative, setupNative } from './lib/native'
import { startRemoteAnalytics } from './lib/remoteAnalytics'
import { AppStateProvider } from './state/AppState.tsx'
import { AuthProvider } from './state/AuthState.tsx'

watchErrors()
startRemoteAnalytics()
void setupNative()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <AppStateProvider>
          <App />
        </AppStateProvider>
      </AuthProvider>
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
