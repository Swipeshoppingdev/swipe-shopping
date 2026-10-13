import { useEffect, useState } from 'react'
import { setSystemBarsTheme } from './native'
import { load, save } from './storage'

/** Tema chiaro/scuro: scuro di base (scelta di Kevin), finché l'utente non sceglie con il pulsante in alto. */
export type Theme = 'light' | 'dark'
const effective = (): Theme => load<Theme | null>('theme', null) ?? 'dark'

/** Colore della barra del browser = colore della barra in alto (cambia con tema e sezione). */
function syncThemeColor() {
  const header = document.querySelector('header')
  const color = header ? getComputedStyle(header).backgroundColor : ''
  const dark = document.documentElement.classList.contains('dark')
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', color && color !== 'rgba(0, 0, 0, 0)' ? color : dark ? '#0e0e10' : '#fafafa')
}
if (typeof window !== 'undefined') {
  new MutationObserver(() => requestAnimationFrame(syncThemeColor)).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  requestAnimationFrame(syncThemeColor)
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  syncThemeColor()
  setSystemBarsTheme(theme === 'dark')
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(effective)
  useEffect(() => {
    apply(theme)
  }, [theme])
  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    save('theme', next)
    setTheme(next)
  }
  return { theme, toggle }
}
