/** Nome e testi globali: cambiali qui quando scegli il brand definitivo. */
export const APP_NAME = 'Swipe Shopping'
export const APP_TAGLINE = 'Scorri, salva, acquista'

/** Testo di disclosure richiesto dal programma Amazon Associates (Italia). */
export const AMAZON_DISCLOSURE = 'In qualità di Affiliato Amazon, ricevo un guadagno dagli acquisti idonei.'
export const GENERIC_DISCLOSURE =
  'I link verso i negozi sono link di affiliazione: se acquisti, potremmo ricevere una commissione senza costi aggiuntivi per te.'

/** Titolare del trattamento mostrato nella pagina Privacy (GDPR, art. 13). */
export const PRIVACY_OWNER = {
  name: 'Kevin Conti',
  email: 'info@swipeshopping.app',
}
export const PRIVACY_UPDATED = '14 ottobre 2026'

/** Profili social dell'app (mostrati nel Profilo). Per aggiungerne uno basta inserirlo qui e in SocialLinks. */
export const SOCIAL_LINKS = {
  instagram: 'https://www.instagram.com/swipeshoppingapp/',
  tiktok: 'https://www.tiktok.com/@swipeshoppingapp',
  whatsapp: 'https://whatsapp.com/channel/0029VbDsQHy5Ui2fYiqw201q',
  threads: 'https://www.threads.com/@swipeshoppingapp',
  x: 'https://x.com/SwipeShopping_',
}

/** Unico account che vede la pagina Statistiche (#/admin). Il controllo vero è in Supabase (admin_stats). */
export const ADMIN_EMAIL = 'kevinconti0118@gmail.com'

/**
 * Funzioni di Amici nascoste per ora (codice e dati restano: basta rimettere true).
 * Liste regalo e Babbo Natale segreto: tolte il 10/10/2026 perché creavano confusione.
 */
export const FEATURES = {
  giftLists: false,
  secretSanta: false,
  /** compleanno nel profilo e "Compleanni in arrivo" (tolti il 10/10/2026) */
  birthdays: false,
  /** "X ha salvato N prodotti" in "Cosa fanno i tuoi amici" (tolto il 10/10/2026: restano le tendenze) */
  feedSaves: false,
  /** "Continua con Google": si accende quando Google è attivo in Supabase (Authentication → Providers). */
  googleLogin: true,
  /**
   * "Continua con Apple" (solo app iPhone, foglio nativo: ios/App/App/AppleSignIn.swift). Si accende quando Apple è attivo
   * in Supabase (Authentication → Providers → Apple, Client ID app.swipeshopping). Finché è spento, nell'app iPhone
   * non c'è nemmeno Google: Apple rifiuta le app con login Google senza "Accedi con Apple" (regola 4.8).
   */
  appleLogin: true,
  /**
   * Parte Amici (profilo con @tag e follower, QR, Amici in Profilo, "Consiglia a un amico", Manda agli amici).
   * Nascosta il 13/10/2026 da Kevin finché non ci saranno più utenti: i link già mandati funzionano ancora.
   */
  social: false,
}

/**
 * Client ID OAuth "Web" di Google (pubblico, è lo stesso messo in Supabase → Google).
 * Sul sito serve al pulsante ufficiale di Google, che mostra "Accedi a swipeshopping.app"
 * invece dell'indirizzo di Supabase. Vuoto = si usa il vecchio giro passando da Supabase.
 */
export const GOOGLE_CLIENT_ID = '104770095773-o6avbplvppk8lkgvq5ogc9trcj5uc55m.apps.googleusercontent.com'


/**
 * Chiave pubblica (site key) di Cloudflare Turnstile, il controllo anti-bot su accesso, registrazione e
 * "Password dimenticata". Il widget gira in public/verifica.html sul sito, dentro un iframe: così funziona
 * anche nelle app (il dominio controllato da Cloudflare è sempre swipeshopping.app). La chiave segreta va solo
 * in Supabase (Authentication → Attack Protection → Turnstile). Vuota = nessun controllo.
 */
export const CAPTCHA_SITE_KEY = '0x4AAAAAAFW8Yg8a7q9ledBu'

/**
 * Chiave pubblica Web Push (notifiche dal sito, anche su iPhone con il sito nella schermata Home).
 * Si ricava dal secret SUPABASE_SERVICE_ROLE_KEY: `node scripts/webpush.ts` (la stampa anche il log di push.yml).
 * Vuota = notifiche solo nell'app Android.
 */
export const WEB_PUSH_KEY = 'BCSREenKlLeeLULKcb_oK8AlR03ghM1ufTroZKLFy8oqbhT5kjQKmTUrHYCFTNcd2wwg5mOV6njirhwBJJtmLz0'
