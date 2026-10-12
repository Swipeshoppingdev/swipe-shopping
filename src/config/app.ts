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
  email: 'rispondea@gmail.com',
}
export const PRIVACY_UPDATED = '9 ottobre 2026'

/** Profili social dell'app (mostrati nel Profilo). Per aggiungerne uno basta inserirlo qui e in SocialLinks. */
export const SOCIAL_LINKS = {
  instagram: 'https://www.instagram.com/swipeshoppingapp/',
  tiktok: 'https://www.tiktok.com/@swipeshoppingapp',
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
  googleLogin: false,
}
