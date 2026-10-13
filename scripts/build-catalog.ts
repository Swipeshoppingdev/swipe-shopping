// Dopo `vite build`: riscrive dist/catalog.json compatto (senza spazi e senza prodotti esauriti),
// così l'app scarica e legge meno dati all'avvio.
import { readFileSync, writeFileSync } from 'node:fs'
import { UNIVERSES, universeOf, type CategoryId } from '../src/config/categories.ts'

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

const file = new URL('../dist/catalog.json', import.meta.url)
const source = readFileSync(file, 'utf8')
const catalog = (JSON.parse(source) as { availability?: string }[]).filter((p) => p.availability !== 'out_of_stock')
const out = JSON.stringify(catalog)
writeFileSync(file, out)
// Una copia per sezione, più leggera: senza campi ricostruibili (vedi expand() in src/lib/catalog.ts).
// catalog.json resta intero per le versioni dell'app già installate.
for (const section of UNIVERSES) {
  const list = catalog
    .filter((p) => universeOf((p as { category: CategoryId }).category) === section)
    .map((raw) => {
      const { source: _s, externalId: _e, ...p } = raw as Record<string, unknown>
      if (p.availability === 'in_stock') delete p.availability
      return p
    })
  const json = JSON.stringify(list)
  writeFileSync(new URL(`../dist/catalog-${section}.json`, import.meta.url), json)
  console.log(`catalog-${section}.json: ${(json.length / 1e6).toFixed(2)} MB, ${list.length} prodotti`)
  // Anteprima: ~300 prodotti vari (al massimo 12 per categoria e genere, con foto e prezzo recente), scelti a caso
  // ma uguali per tutto il giorno. L'app la mostra subito mentre scarica il catalogo completo (src/state/AppState.tsx).
  const day = new Date().toISOString().slice(0, 10)
  const perGroup = new Map<string, number>()
  const preview = list
    .filter((p) => p.imageUrl && typeof p.priceCheckedAt === 'string' && Date.now() - Date.parse(p.priceCheckedAt) < 20 * 3_600_000)
    .map((p) => ({ p, k: hash(`${day}:${p.id}`) }))
    .sort((a, b) => a.k - b.k)
    .filter(({ p }) => {
      const g = `${p.category}:${p.gender}`
      const n = perGroup.get(g) ?? 0
      perGroup.set(g, n + 1)
      return n < 12
    })
    .slice(0, 300)
    .map(({ p }) => p)
  writeFileSync(new URL(`../dist/catalog-${section}-anteprima.json`, import.meta.url), JSON.stringify(preview))
}
console.log(`catalog.json: ${(source.length / 1e6).toFixed(2)} MB → ${(out.length / 1e6).toFixed(2)} MB, ${catalog.length} prodotti`)
