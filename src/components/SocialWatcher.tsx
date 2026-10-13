import { useEffect } from 'react'
import { useFollowsSync } from '../lib/follows'
import { resumePush } from '../lib/push'
import { refreshUnseen } from '../lib/social'
import { useAuth } from '../state/AuthState'

/** Social in sottofondo: aggiorna il pallino delle novità sulla scheda Amici e rinnova le notifiche push, allinea le marche seguite. */
export function SocialWatcher() {
  const auth = useAuth()
  const userId = auth.user?.id
  useFollowsSync()

  useEffect(() => {
    if (!userId) return
    void refreshUnseen()
    void resumePush().catch(() => {})
    const timer = window.setInterval(() => document.visibilityState === 'visible' && void refreshUnseen(), 60_000)
    const onVisible = () => document.visibilityState === 'visible' && void refreshUnseen()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userId])

  return null
}
