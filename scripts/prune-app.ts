// Dopo `vite build` per l'app Android/iOS: toglie dal pacchetto i dati che l'app scarica sempre dal sito
// (catalogo, dettagli) e le cose solo del sito (service worker, testi email, immagini per Google Play). L'app resta leggera e aggiornata.
import { readdirSync, rmSync } from 'node:fs'

const catalogs = readdirSync(new URL('../dist/', import.meta.url)).filter((f) => /^catalog(-\w+)?\.json$/.test(f))
for (const path of [...catalogs, 'details', 'email', 'play', 'sw.js']) {
  rmSync(new URL(`../dist/${path}`, import.meta.url), { recursive: true, force: true })
}
console.log('Pacchetto app pronto: dati dal sito online.')
