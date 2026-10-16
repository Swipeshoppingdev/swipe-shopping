import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logCrash } from '../lib/crashLog'
import { isReloading, isStaleChunk, reloadForUpdate } from '../lib/staleChunk'

/** Se un errore blocca l'app, invece della pagina vuota si vede un messaggio con "Riprova" (e l'errore resta nel registro). */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Sito appena aggiornato: basta ricaricare per avere i file nuovi.
    if (isReloading() || (isStaleChunk(error) && reloadForUpdate())) return
    logCrash('react', error, info.componentStack ?? undefined)
  }

  render() {
    if (!this.state.failed) return this.props.children
    // Si sta ricaricando con i file nuovi: niente "Ops" per un attimo, la pagina riparte da sola.
    if (isReloading()) return null
    // Colori fissi: il tema potrebbe essere proprio la parte rotta.
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, background: '#fafafa', color: '#171717', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ fontSize: 48 }}>😵</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Ops, qualcosa si è inceppato</h1>
        <p style={{ margin: 0, color: '#525252' }}>I tuoi preferiti sono salvi. Tocca qui sotto per ripartire.</p>
        <button
          type="button"
          onClick={() => {
            location.hash = '#/scopri'
            location.reload()
          }}
          style={{ marginTop: 8, padding: '12px 28px', borderRadius: 999, border: 0, background: '#f43f5e', color: '#fff', fontWeight: 700, fontSize: 16 }}
        >
          Riprova
        </button>
      </div>
    )
  }
}
