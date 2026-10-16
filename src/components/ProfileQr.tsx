import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { profileUrl, type SocialCard } from '../lib/social'
import { Avatar } from './SocialBits'
import { useBackClose } from '../lib/backClose'

/** QR del mio profilo: un amico lo inquadra con la fotocamera e mi segue (link #/u/<codice>). */
export function ProfileQr({ me, onClose }: { me: SocialCard; onClose: () => void }) {
  useBackClose(true, onClose)
  const [svg, setSvg] = useState('')
  useEffect(() => {
    // Sempre nero su bianco, anche in tema scuro: le fotocamere lo leggono meglio.
    // La libreria si carica solo quando serve.
    void import('qrcode').then(({ default: QRCode }) => QRCode.toString(profileUrl(me.code), { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })).then(setSvg)
  }, [me.code])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Il mio QR"
        className="w-full max-w-xs space-y-4 rounded-3xl bg-white p-5 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-end">
          <button type="button" onClick={onClose} aria-label="Chiudi" className="-mt-1 -mr-1 text-neutral-500">
            <X className="size-5" />
          </button>
        </div>
        <div className="-mt-6 flex flex-col items-center gap-1">
          <Avatar emoji={me.avatar} size="lg" />
          <p className="text-lg font-bold">{me.handle}</p>
          {me.tag && <p className="text-sm font-medium text-rose-500">@{me.tag}</p>}
        </div>
        <div className="mx-auto aspect-square w-full rounded-2xl bg-[#fff] p-2 ring-1 ring-black/5 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="text-sm text-neutral-600">Fallo inquadrare con la fotocamera del telefono: si apre il tuo profilo e possono seguirti.</p>
      </div>
    </div>
  )
}
