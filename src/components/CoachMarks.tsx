import { ArrowUp, Hand, Heart, Images, LayoutGrid, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { load, save } from '../lib/storage'
import { ONBOARDED_EVENT } from './Welcome'

/** Guida rapida al primo utilizzo, sopra la prima card (dopo il benvenuto). */
export function CoachMarks() {
  const [onboarded, setOnboarded] = useState(() => load<boolean>('onboarded', false))
  const [seen, setSeen] = useState(() => load<boolean>('coachSeen', false))

  useEffect(() => {
    const on = () => setOnboarded(true)
    window.addEventListener(ONBOARDED_EVENT, on)
    return () => window.removeEventListener(ONBOARDED_EVENT, on)
  }, [])

  if (!onboarded || seen) return null
  const close = () => {
    save('coachSeen', true)
    setSeen(true)
  }

  return (
    <>
    {/* Freccia fuori dalla card, sotto il menu delle sezioni in alto a sinistra. */}
    <div className="pointer-events-none fixed top-[calc(env(safe-area-inset-top)+3.4rem)] left-[max(0.5rem,calc(50%_-_14rem_+_0.5rem))] z-40 flex flex-col items-start sm:left-[calc(50%_-_21rem_+_0.5rem)]">
      <ArrowUp className="ml-9 size-7 animate-bounce text-[#f97316]" strokeWidth={3} />
      <span className="rounded-2xl bg-[#f97316] px-3 py-1.5 text-sm font-semibold text-[#fff] shadow-lg">Qui trovi le altre sezioni</span>
    </div>
    <div className="absolute inset-0 z-30 flex overflow-y-auto rounded-3xl bg-black/65 p-5 backdrop-blur-[2px]" onClick={close}>
      {/* m-auto: centrata, ma sugli schermi bassi si scorre invece di tagliare il titolo. */}
      <div role="dialog" aria-label="Come funziona" className="m-auto w-full space-y-3.5 text-[#fff] [@media(max-height:700px)]:space-y-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Come funziona</h2>
          <button type="button" onClick={close} aria-label="Chiudi la guida" className="opacity-80">
            <X className="size-5" />
          </button>
        </div>
        <Tip icon={<Heart className="size-5" />}>
          <strong>Scorri a destra</strong> se ti piace: finisce nei Preferiti. <strong>A sinistra</strong> se non fa per te.
        </Tip>
        <Tip icon={<Images className="size-5" />}>
          <strong>Tocca i lati della foto</strong> per vedere le altre foto del prodotto.
        </Tip>
        <Tip icon={<Hand className="size-5" />}>
          <strong>Tocca il centro</strong> o il nome per aprire la scheda con caratteristiche e prezzo.
        </Tip>
        <Tip icon={<ArrowUp className="size-5" />}>
          <strong>Il menu in alto a sinistra</strong> apre le altre sezioni (Beauty, Tech, Casa e le altre), ognuna con preferiti e filtri suoi.
        </Tip>
        <Tip icon={<LayoutGrid className="size-5" />}>
          <strong>Outfit</strong>, nel menu delle sezioni, ha look completi già abbinati: se un capo non ti convince, lo cambi.
        </Tip>
        <button type="button" onClick={close} className="h-12 w-full rounded-full bg-rose-500 font-semibold text-[#fff]">
          Ho capito
        </button>
      </div>
    </div>
    </>
  )
}

function Tip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex gap-3 text-[15px] leading-snug [@media(max-height:700px)]:text-[13px]">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#fff]/15 [@media(max-height:700px)]:size-7">{icon}</span>
      <span>{children}</span>
    </p>
  )
}
