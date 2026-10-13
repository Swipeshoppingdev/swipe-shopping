/** Chiude il gioco aperto (es. aprendo il menu Sezioni): il gioco sopra il menu rovinava la grafica. */
export const CLOSE_BREAKS_EVENT = 'swipeshop:closeBreaks'
export const closeBreaks = () => window.dispatchEvent(new Event(CLOSE_BREAKS_EVENT))
