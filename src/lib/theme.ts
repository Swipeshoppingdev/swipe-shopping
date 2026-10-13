import { useEffect, useState } from 'react'
import { setSystemBarsTheme } from './native'
import { load, save } from './storage'

/** Tema chiaro/scuro: segue il telefono finché l'utente non sceglie con il pulsante in alto. */
export type Theme = 'light' | 'dark'
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

const effective = (): Theme => {
  const chosen = load<Theme | null>('theme', null)
  return chosen ?? (media?.matches ? 'dark' : 'light')
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 'dark' ? '#0e0e10' : '#fafafa')
  setSystemBarsTheme(theme === 'dark')
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(effective)
  useEffect(() => {
    apply(theme)
  }, [theme])
  useEffect(() => {
    if (!media) return
    const onChange = () => setTheme(effective())
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    save('theme', next)
    setTheme(next)
  }
  return { theme, toggle }
}
