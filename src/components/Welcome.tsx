import { AnimatePresence, motion } from 'framer-motion'
import { Bell, ChevronLeft, ChevronRight, Cpu, Gamepad2, Heart, Scale, ShieldCheck, Sparkles, TrendingDown, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { APP_NAME } from '../config/app'
import { CATEGORY_GROUPS, SECTIONS, type CategoryId } from '../config/categories'
import { load, save } from '../lib/storage'
import { routeHref } from '../lib/useHashRoute'
import { useApp } from '../state/AppState'
import { useAuth } from '../state/AuthState'
import type { Filters } from '../types/product'
import { AuthForm } from './AccountCard'

type GroupId = (typeof CATEGORY_GROUPS)[number]['id'] | (typeof EXTRA_SECTIONS)[number]['id']

/** Le altre sezioni: qui non filtrano la moda, decidono solo da dove si parte. */
const EXTRA_SECTIONS = [
  { id: 'beauty', emoji: '💄', label: 'Beauty', hint: 'profumi, trucco, capelli', bg: 'bg-[#fdf4ff] ring-[#c026d3]' },
  { id: 'tech', emoji: '🎧', label: 'Tech', hint: 'cuffie, smartphone, gaming', bg: 'bg-[#fff7ed] ring-[#f97316]' },
  { id: 'gadget', emoji: '🎁', label: 'Gadget', hint: 'idee regalo, oggetti curiosi', bg: 'bg-[#f5f3ff] ring-[#8b5cf6]' },
  { id: 'casa', emoji: '🛋️', label: 'Casa', hint: 'cucina, design, smart', bg: 'bg-[#eff6ff] ring-[#2563eb]' },
  { id: 'snack', emoji: '🍫', label: 'Snack', hint: 'dolci, salati, caffè', bg: 'bg-[#f0fdfa] ring-[#0d9488]' },
  { id: 'animali', emoji: '🐾', label: 'Animali', hint: 'cani e gatti', bg: 'bg-[#fefce8] ring-[#a16207]' },
] as const

const GENDERS: { value: Filters['gender']; label: string }[] = [
  { value: 'donna', label: 'Donna' },
  { value: 'uomo', label: 'Uomo' },
  { value: 'tutti', label: 'Tutti e due' },
]

/** Benvenuto al primo avvio: come funziona, per chi, cosa interessa, invito a registrarsi. */
/** Avvisa la guida rapida che il benvenuto è finito. */
export const ONBOARDED_EVENT = 'swipeshop:onboarded'

export function Welcome() {
  const [open, setOpen] = useState(() => !load<boolean>('onboarded', false))
  const auth = useAuth()
  const { state, actions } = useApp()
  const [step, setStep] = useState(0)
  const [gender, setGender] = useState<Filters['gender']>(state.filters.gender)
  const [groups, setGroups] = useState<GroupId[]>([])

  const showSignup = auth.enabled && !auth.user
  // 0-2: perché usarla (tre schermate brevi), 3: per chi, 4: interessi, 5: account.
  const lastStep = showSignup ? 5 : 4

  const finish = () => {
    save('onboarded', true)
    window.dispatchEvent(new Event(ONBOARDED_EVENT))
    setOpen(false)
  }

  const applyPreferences = () => {
    const categories = CATEGORY_GROUPS.filter((g) => groups.includes(g.id)).flatMap((g) =>
      g.items.map((i) => i.id as CategoryId),
    )
    actions.setSectionFilters('moda', { ...state.filters, gender, categories })
    // Il genere vale anche nelle altre sezioni divise per genere (Beauty).
    for (const s of SECTIONS) {
      if (s.id !== 'moda' && s.gender) actions.setSectionFilters(s.id, { ...state.sectionFilters[s.id], gender })
    }
    // Si parte dalla moda; chi sceglie soprattutto un'altra sezione (al massimo una categoria moda) parte da lì.
    const extra = EXTRA_SECTIONS.find((s) => groups.includes(s.id))
    const modaPicked = groups.filter((g) => !EXTRA_SECTIONS.some((s) => s.id === g)).length
    actions.setMode(extra && modaPicked <= 1 ? extra.id : 'moda')
  }

  const next = () => {
    if (step === 4) applyPreferences()
    if (step >= lastStep) finish()
    else setStep(step + 1)
  }

  // Registrazione o accesso completati dal benvenuto: si entra subito nell'app.
  const signedUpHere = step === 5 && !!auth.user
  useEffect(() => {
    if (!signedUpHere) return
    save('onboarded', true)
    window.dispatchEvent(new Event(ONBOARDED_EVENT))
  }, [signedUpHere])

  if (!open || signedUpHere) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
        {step > 0 ? (
          <button type="button" onClick={() => setStep(step - 1)} aria-label="Indietro" className="p-2 text-neutral-500">
            <ChevronLeft className="size-6" />
          </button>
        ) : (
          <span className="size-10" />
        )}
        <div className="flex gap-1.5" aria-hidden>
          {Array.from({ length: lastStep + 1 }, (_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-rose-500' : 'w-1.5 bg-neutral-200'}`} />
          ))}
        </div>
        <button type="button" onClick={finish} className="p-2 text-sm font-medium text-neutral-500">
          Salta
        </button>
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col overflow-y-auto px-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.2 }}
            className="flex flex-1 flex-col justify-center gap-6 py-6"
          >
            {step === 0 && (
              <>
                <img src="./icons/icon-192.png" alt="" className="mx-auto size-24 rounded-3xl shadow-lg ring-1 ring-black/5" />
                <div className="space-y-2 text-center">
                  <h1 className="text-3xl font-black tracking-tight">Benvenuto su {APP_NAME}</h1>
                  <p className="text-neutral-600">Moda, beauty, tech, casa e tanto altro dai migliori marchi e negozi, un prodotto alla volta.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-center text-sm">
                  <div className="rounded-2xl bg-neutral-100 p-4">
                    <X className="mx-auto mb-2 size-8 text-neutral-700" />
                    <strong>Scorri a sinistra</strong>
                    <p className="text-neutral-500">per scartare</p>
                  </div>
                  <div className="rounded-2xl bg-rose-50 p-4">
                    <Heart className="mx-auto mb-2 size-8 fill-rose-500 text-rose-500" />
                    <strong>Scorri a destra</strong>
                    <p className="text-neutral-500">per salvare nei preferiti</p>
                  </div>
                </div>
                <p className="text-center text-sm text-neutral-500">Tocca il prodotto per vedere foto e dettagli.</p>
                <p className="flex items-center justify-center gap-1.5 text-center text-sm text-neutral-500">
                  <Cpu className="size-4 shrink-0 text-[#f97316]" />
                  Dal menu in alto a sinistra passi alle altre sezioni: Beauty, Tech, Casa, Gadget, Snack e Animali.
                </p>
              </>
            )}

            {step === 1 && (
              <Why
                emoji="💸"
                title="Compra meglio, spendi meno"
                points={[
                  { icon: <Scale className="size-5" />, title: 'Prezzo giusto?', text: 'Ti diciamo se un prezzo è basso o alto rispetto ai prodotti simili di oggi.' },
                  { icon: <TrendingDown className="size-5" />, title: 'Simile ma costa meno', text: 'Alternative più economiche sotto ogni prodotto, con quanto risparmi.' },
                  { icon: <Bell className="size-5" />, title: 'Avvisi sui preferiti', text: 'Una notifica quando quello che hai salvato va in offerta.' },
                ]}
              />
            )}

            {step === 2 && (
              <Why
                emoji="🎮"
                title="Fare shopping diventa un gioco"
                points={[
                  { icon: <Gamepad2 className="size-5" />, title: 'Mini giochi', text: 'Indovina il prezzo, Più o meno, la Ruota della fortuna e altri, tra uno swipe e l\'altro.' },
                  { icon: <Sparkles className="size-5" />, title: 'Outfit e drop del giorno', text: 'Look completi già pronti e ogni giorno 10 prodotti nuovi o scontati da scoprire.' },
                  { icon: <ShieldCheck className="size-5" />, title: 'Prezzi controllati, acquisti sicuri', text: 'Prezzi aggiornati più volte al giorno; compri direttamente su Amazon e negli altri negozi.' },
                ]}
              />
            )}

            {step === 3 && (
              <>
                <h2 className="text-center text-2xl font-bold">Per chi cerchi?</h2>
                <div className="flex flex-col gap-3">
                  {GENDERS.map((g) => (
                    <button
                      key={g.value}
                      type="button"
                      onClick={() => setGender(g.value)}
                      aria-pressed={gender === g.value}
                      className={`h-14 rounded-2xl text-lg font-semibold ring-2 transition ${
                        gender === g.value ? 'bg-neutral-900 text-white ring-neutral-900' : 'bg-white ring-neutral-200'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <div className="space-y-1 text-center">
                  <h2 className="text-2xl font-bold">Cosa ti interessa?</h2>
                  <p className="text-sm text-neutral-500">Scegli quanto vuoi, puoi cambiarlo quando vuoi dai Filtri.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {CATEGORY_GROUPS.map((g) => {
                    const active = groups.includes(g.id)
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setGroups(active ? groups.filter((x) => x !== g.id) : [...groups, g.id])}
                        aria-pressed={active}
                        className={`flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl text-base font-semibold ring-2 transition ${
                          active ? 'bg-rose-50 ring-rose-500' : 'bg-white ring-neutral-200'
                        }`}
                      >
                        <span className="text-4xl">{g.emoji}</span>
                        {g.label}
                      </button>
                    )
                  })}
                  {EXTRA_SECTIONS.map((x) => {
                    const active = groups.includes(x.id)
                    return (
                      <button
                        key={x.id}
                        type="button"
                        onClick={() => setGroups(active ? groups.filter((g) => g !== x.id) : [...groups, x.id])}
                        aria-pressed={active}
                        className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl text-base font-semibold ring-2 transition ${
                          active ? x.bg : 'bg-white ring-neutral-200'
                        }`}
                      >
                        <span className="text-4xl">{x.emoji}</span>
                        {x.label}
                        <span className="text-xs font-normal text-neutral-500">{x.hint}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {step === 5 && (
              <>
                <div className="space-y-2 text-center">
                  <h2 className="text-2xl font-bold">Non perdere i tuoi preferiti</h2>
                  <p className="text-neutral-600">
                    Con un account gratuito ritrovi i preferiti su ogni dispositivo e vedi subito quando un prodotto salvato va in
                    offerta.
                  </p>
                </div>
                <AuthForm initialMode="registrati" />
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mx-auto w-full max-w-md space-y-3 px-6 pt-2 pb-4">
        <button
          type="button"
          onClick={next}
          className={`flex h-13 w-full items-center justify-center gap-1 rounded-full py-3.5 text-lg font-semibold ${
            step === 5 ? 'text-neutral-500' : 'bg-rose-500 text-[#fff] active:scale-[0.98]'
          }`}
        >
          {step === 5 ? 'Più tardi' : step === 4 && groups.length === 0 ? 'Mostrami tutto' : 'Continua'}
          {step < 5 && <ChevronRight className="size-5" />}
        </button>
        {step === 0 && (
          <p className="text-center text-xs text-neutral-500">
            Continuando accetti i{' '}
            <a href={routeHref('privacy')} target="_blank" rel="noopener" className="underline">
              termini e l'informativa privacy
            </a>
            .
          </p>
        )}
      </div>
    </div>
  )
}

/** Una schermata "perché usarla": titolo e tre vantaggi con icona. */
function Why({ emoji, title, points }: { emoji: string; title: string; points: { icon: React.ReactNode; title: string; text: string }[] }) {
  return (
    <>
      <div className="space-y-2 text-center">
        <div className="text-6xl" aria-hidden>
          {emoji}
        </div>
        <h2 className="text-2xl font-black tracking-tight">{title}</h2>
      </div>
      <ul className="space-y-3">
        {points.map((p) => (
          <li key={p.title} className="flex items-start gap-3 rounded-2xl bg-neutral-100 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-rose-500 text-[#fff]">{p.icon}</span>
            <span className="text-sm">
              <strong className="block text-base">{p.title}</strong>
              <span className="text-neutral-600">{p.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
