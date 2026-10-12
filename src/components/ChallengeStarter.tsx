import { challengeProducts } from '../lib/priceGame'
import { social } from '../lib/social'
import { useApp } from '../state/AppState'
import { FriendPicker } from './SocialBits'

/** Sceglie gli amici e crea una sfida "Indovina il prezzo" con 5 prodotti del mazzo, poi apre la sfida. */
export function ChallengeStarter({ onClose }: { onClose: () => void }) {
  const { deck } = useApp()
  return (
    <FriendPicker
      title="Sfida sui prezzi con…"
      confirmLabel="Sfida"
      onClose={onClose}
      onConfirm={async (codes) => {
        const pool = [...deck.slice(1, 200)].sort(() => Math.random() - 0.5)
        const ids = challengeProducts(pool).map((p) => p.id)
        if (ids.length < 3) throw new Error('Pochi prezzi aggiornati qui: riprova da un\'altra sezione.')
        const id = await social.createChallenge(codes, ids)
        onClose()
        window.location.hash = `#/sfida/${id}`
      }}
    />
  )
}
