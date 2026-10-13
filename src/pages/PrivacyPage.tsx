import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { AMAZON_DISCLOSURE, APP_NAME, PRIVACY_OWNER, PRIVACY_UPDATED } from '../config/app'
import { routeHref } from '../lib/useHashRoute'

/** Informativa privacy (GDPR art. 13) e termini d'uso. */
export function PrivacyPage() {
  const owner = PRIVACY_OWNER
  return (
    <article className="space-y-5 pb-8 text-sm leading-relaxed text-neutral-700">
      <a href={routeHref('profilo')} className="inline-flex items-center gap-1 pt-1 font-medium text-neutral-500">
        <ChevronLeft className="size-4" /> Profilo
      </a>
      <header>
        <h1 className="text-2xl font-bold text-neutral-900">Privacy e termini</h1>
        <p className="text-xs text-neutral-500">Ultimo aggiornamento: {PRIVACY_UPDATED}</p>
      </header>

      <Section title="Chi gestisce i dati">
        <p>
          Titolare del trattamento: <strong>{owner.name}</strong>. Per qualsiasi richiesta sulla privacy scrivi a{' '}
          <a href={`mailto:${owner.email}`} className="font-medium text-rose-600 underline">
            {owner.email}
          </a>
          .
        </p>
      </Section>

      <Section title="Quali dati raccogliamo">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Senza account:</strong> preferiti, prodotti scartati e filtri restano solo sul tuo dispositivo (memoria del
            browser). Non ci arrivano.
          </li>
          <li>
            <strong>Con un account:</strong> indirizzo email, password (salvata in forma cifrata, non la vediamo mai),
            preferiti, prodotti scartati e filtri, per ritrovarli su ogni dispositivo. Se accedi con Google, Google ci
            comunica solo la tua email e il tuo nome: non riceviamo la password di Google.
          </li>
          <li>
            <strong>Statistiche d'uso:</strong> solo se le attivi. Prodotti visti, like, click e condivisioni, legati a un codice
            casuale del dispositivo e non al tuo nome o alla tua email. Le usiamo solo in forma aggregata per capire cosa
            piace e migliorare l'app.
          </li>
          <li>
            <strong>Avvisi di prezzo:</strong> se hai un account, quando un tuo preferito è in offerta ti avvisiamo (notifica o
            email) al massimo ogni 3 giorni, oppure una volta al giorno per i prodotti nella cartella "Quando scende". Puoi
            spegnerli in ogni momento dal Profilo.
          </li>
          <li>
            <strong>Errori e segnalazioni:</strong> se l'app si blocca, o se usi "Segnala un problema", riceviamo in forma
            anonima il tipo di problema, la pagina dell'app e il modello di browser o telefono. Nessun nome, email o account.
          </li>
          <li>
            <strong>Comunicazioni:</strong> se hai un account, ogni tanto possiamo scriverti per novità importanti sull'app.
            Puoi spegnerle in ogni momento dal Profilo o dal link in fondo a ogni email.
          </li>
          <li>
            <strong>Amici:</strong> se usi la sezione Amici ricevi un nome generato a caso (es. "Volpe Rosa 482") e un avatar
            scelto da un elenco: non mostriamo mai la tua email. Chi ha il tuo link di invito, o cerca il tuo @tag (ricavato dal nome), vede nome e avatar e può seguirti;
            chi ti segue vede le tue liste regalo e i sondaggi, e i preferiti che salvi solo se lo attivi tu (che contano anche, senza il tuo nome, tra i prodotti "di tendenza" dei tuoi amici). Chi ha il link di
            una lista o di un sondaggio li vede e può votare o segnare "lo prendo io". Puoi rimuovere o bloccare chi ti segue.
            Se lo inserisci, chi ti segue vede il giorno e il mese del tuo compleanno (non l'anno). Gli amici possono mandarti solo
            contenuti prestabiliti (un prodotto, un sondaggio, una lista, un invito a Swipe insieme, una sfida sui prezzi, una reazione con emoji, un invito al
            Babbo Natale segreto): non ci sono messaggi scritti. Nella Chat tu e un amico vedete i prodotti, i sondaggi e gli inviti che vi siete mandati e le emoji di risposta. Nel Babbo Natale segreto ognuno vede solo la persona a cui fa
            il regalo, mai chi lo fa a lui. Nelle sfide sui prezzi salviamo solo il punteggio di chi gioca, visibile agli altri giocatori della stessa sfida.
          </li>
          <li>
            <strong>Dati tecnici:</strong> come ogni sito, il servizio di hosting registra indirizzo IP e tipo di browser per
            sicurezza e funzionamento.
          </li>
        </ul>
        <p>Non usiamo cookie pubblicitari né di profilazione e non vendiamo i tuoi dati.</p>
      </Section>

      <Section title="Perché e su quale base">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Far funzionare l'app e il tuo account: esecuzione del servizio che hai richiesto (art. 6.1.b GDPR).</li>
          <li>Statistiche d'uso: il tuo consenso (art. 6.1.a), che puoi ritirare in ogni momento dal Profilo.</li>
          <li>Avvisi di prezzo: un servizio legato al tuo account (art. 6.1.b), che puoi disattivare dal Profilo.</li>
          <li>Sicurezza del sito: legittimo interesse (art. 6.1.f).</li>
        </ul>
      </Section>

      <Section title="A chi affidiamo i dati">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Supabase</strong>: database, gestione degli account e statistiche.
          </li>
          <li>
            <strong>Resend</strong>: invio delle email (conferma dell'account, recupero password, avvisi di prezzo, comunicazioni).
          </li>
          <li>
            <strong>Google</strong>: solo se scegli "Continua con Google", per verificare chi sei.
          </li>
          <li>
            <strong>GitHub Pages</strong> (GitHub Inc.): pubblicazione del sito.
          </li>
          <li>
            <strong>Cloudflare</strong>: gestione del dominio.
          </li>
        </ul>
        <p>
          Alcuni di questi fornitori hanno sede negli Stati Uniti. In quel caso il trasferimento è protetto dalle garanzie
          previste dal GDPR (EU-US Data Privacy Framework o clausole contrattuali standard).
        </p>
      </Section>

      <Section title="Link ai negozi">
        <p>
          Quando apri un prodotto passi al sito del negozio (per esempio Amazon), che tratta i tuoi dati secondo la propria
          informativa e può usare i propri cookie. I link sono di affiliazione: se acquisti, riceviamo una piccola commissione
          senza costi aggiuntivi per te. {AMAZON_DISCLOSURE}
        </p>
      </Section>

      <Section title="Per quanto tempo">
        <p>
          I dati dell'account restano finché l'account è attivo. Se lo elimini dal Profilo, email, preferiti e impostazioni
          vengono cancellati subito e in modo definitivo. I dati sul dispositivo li cancelli da Profilo → Dati.
        </p>
      </Section>

      <Section title="I tuoi diritti">
        <p>
          Puoi chiedere accesso, correzione, cancellazione, limitazione, portabilità dei tuoi dati e opporti al trattamento
          scrivendo all'indirizzo qui sopra. Puoi anche presentare reclamo al Garante per la protezione dei dati personali
          (garanteprivacy.it).
        </p>
      </Section>

      <Section title="Termini d'uso">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            {APP_NAME} è una vetrina: non vendiamo direttamente. L'acquisto, il pagamento, la spedizione e i resi avvengono sul
            sito del negozio, con le sue condizioni.
          </li>
          <li>
            Prezzi, sconti e disponibilità vengono dai negozi e si aggiornano più volte al giorno, ma possono cambiare: vale
            quello mostrato dal negozio al momento dell'acquisto.
          </li>
          <li>Per creare un account devi avere almeno 14 anni.</li>
          <li>Il servizio è gratuito e può cambiare o essere sospeso. Eventuali modifiche a questa pagina saranno indicate qui.</li>
        </ul>
      </Section>
    </article>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
      {children}
    </section>
  )
}
