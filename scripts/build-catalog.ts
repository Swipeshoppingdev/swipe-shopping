// Dopo `vite build`: riscrive dist/catalog.json compatto (senza spazi e senza prodotti esauriti),
// così l'app scarica e legge meno dati all'avvio.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { UNIVERSES, universeOf, type CategoryId } from '../src/config/categories.ts'
import { checkCatalog } from '../src/lib/validate.ts'
import { DETAIL_SHARDS, SMALL_SHARDS, detailShard } from '../src/lib/details.ts'

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

const file = new URL('../dist/catalog.json', import.meta.url)
const source = readFileSync(file, 'utf8')
// Controllo completo qui, una volta sola: l'app fa solo un controllo veloce (src/lib/catalog.ts), che sui telefoni lenti conta.
const checked = checkCatalog(JSON.parse(source))
if (checked.invalid.length) console.warn(`Scartati ${checked.invalid.length} prodotti non validi, es. ${JSON.stringify(checked.invalid.slice(0, 3))}`)
const catalog = (checked.valid as unknown as { availability?: string }[]).filter((p) => p.availability !== 'out_of_stock')
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
  // Un prodotto per riga: l'app può leggere il file a pezzi (vedi parseInPieces in src/lib/catalog.ts)
  // invece che tutto in un colpo, che sui telefoni economici bloccava lo schermo per quasi un secondo.
  const json = `[\n${list.map((p) => JSON.stringify(p)).join(',\n')}\n]`
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

// Dettagli (foto in più, caratteristiche) divisi anche in file piccoli: details/<n>.json ne ha ~230 prodotti (~40 KB)
// e per ogni carta se ne scaricava uno intero. details/p/<n>.json ne ha ~15 (~3 KB). I file grandi restano per le
// versioni dell'app già installate.
const small: Record<string, unknown>[] = Array.from({ length: SMALL_SHARDS }, () => ({}))
let detailCount = 0
for (let n = 0; n < DETAIL_SHARDS; n++) {
  const f = new URL(`../dist/details/${n}.json`, import.meta.url)
  if (!existsSync(f)) continue
  for (const [id, d] of Object.entries(JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>)) {
    small[detailShard(id, SMALL_SHARDS)][id] = d
    detailCount++
  }
}
mkdirSync(new URL('../dist/details/p/', import.meta.url), { recursive: true })
small.forEach((shard, n) => writeFileSync(new URL(`../dist/details/p/${n}.json`, import.meta.url), JSON.stringify(shard)))
console.log(`details/p: ${detailCount} prodotti in ${SMALL_SHARDS} file`)
