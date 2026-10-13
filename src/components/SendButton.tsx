import { Send } from 'lucide-react'
import { useState } from 'react'
import { shareProduct } from '../lib/share'
import { social } from '../lib/social'
import { useAuth } from '../state/AuthState'
import type { Product } from '../types/product'
import { FriendPicker } from './SocialBits'
import { FEATURES } from '../config/app'

/**
 * Pulsante "Manda" della home: con account si sceglie a quali amici mandarlo (arriva nella loro Chat),
 * oppure si condivide fuori dall'app; senza account apre direttamente la condivisione del telefono.
 */
export function SendButton({ product, className }: { product: Product; className: string }) {
  const auth = useAuth()
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState('')
  const flash = (text: string) => {
    setToast(text)
    setTimeout(() => setToast(''), 2000)
  }
  const shareOutside = async () => {
    setOpen(false)
    if ((await shareProduct(product)) === 'copied') flash('Link copiato')
  }
  return (
    <>
      <button
        type="button"
        aria-label={`Manda ${product.title}`}
        title="Manda a un amico"
        onClick={() => (auth.user && FEATURES.social ? setOpen(true) : void shareOutside())}
        className={/\babsolute\b/.test(className) ? className : `relative ${className}`}
      >
        <Send className="size-5" />
        {toast && (
          <span className="absolute -top-8 left-1/2 -translate-x-1/2 rounded-full bg-neutral-900 px-2 py-1 text-xs whitespace-nowrap text-white">
            {toast}
          </span>
        )}
      </button>
      {open && (
        <FriendPicker
          title="Manda a…"
          confirmLabel="Manda"
          onClose={() => setOpen(false)}
          onConfirm={async (codes) => {
            const n = await social.send(codes, 'consiglio', { productId: product.id })
            setOpen(false)
            flash(n === 1 ? 'Inviato!' : `Inviato a ${n}!`)
          }}
          extra={
            <button type="button" onClick={shareOutside} className="mt-3 w-full text-center text-sm font-medium text-neutral-600 underline">
              Condividi con altre app
            </button>
          }
        />
      )}
    </>
  )
}
