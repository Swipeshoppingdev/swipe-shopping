// Dopo il build: pagine statiche che Google può leggere (l'app vera usa JavaScript e il routing
// con #, che i motori di ricerca indicizzano male). Una pagina per categoria (anche per uomo e
// donna), una per marca e una per le offerte, più sitemap.xml e robots.txt.
// Ogni prodotto porta all'app (#/p/<id>) e al negozio con link affiliato.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { SECTIONS, UNIVERSES, categoryLabel, groupsOf, sectionOf, universeOf, type Universe } from '../src/config/categories.ts'
import { SOCIAL_LINKS } from '../src/config/app.ts'
import { DETAIL_SHARDS, type ProductDetails } from '../src/lib/details.ts'
import { productUrl, STORES } from '../src/config/stores.ts'
import { STYLE_LABEL, buildOutfits, outfitTotal, type Outfit, type OutfitStyle } from '../src/lib/outfits.ts'
import { shareCode } from '../src/lib/shareCode.ts'
import type { Product } from '../src/types/product.ts'

const SITE = 'https://swipeshopping.app'
const MAX_PRODUCTS = 48
const MIN_PRODUCTS = 6
const dist = new URL('../dist/', import.meta.url)
const products = (JSON.parse(readFileSync(new URL('catalog.json', dist), 'utf8')) as Product[]).filter(
  (p) => p.availability !== 'out_of_stock' && p.imageUrl,
)
const now = Date.now()
const builtAt = new Date(now)
const builtLabel = builtAt.toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'long', timeStyle: 'short' })

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })

/** Prezzo solo se verificato entro la finestra del negozio (24 ore per Amazon). */
function price(p: Product) {
  if (p.price === undefined || !p.priceCheckedAt) return null
  if (now - Date.parse(p.priceCheckedAt) > STORES[p.store].priceMaxAgeHours * 3_600_000) return null
  const off = p.originalPrice && p.originalPrice > p.price ? Math.round((1 - p.price / p.originalPrice) * 100) : 0
  return { text: `${p.priceFrom ? 'da ' : ''}${eur.format(p.price)}`, off: off >= 5 ? off : 0 }
}

// Ordine stabile ma vario: prima gli scontati, poi un mix che cambia a ogni aggiornamento.
const score = (p: Product) => (price(p)?.off ?? 0) * 1000 + (parseInt(p.externalId.slice(-4), 36) % 997)
// Stesso articolo in più taglie ("…, M" e "…, L"): uno solo per pagina.
const model = (p: Product) => p.title.replace(/,\s*[^,]{1,12}$/, '').toLowerCase()
function pick(list: Product[]) {
  const seen = new Set<string>()
  return [...list]
    .sort((a, b) => score(b) - score(a))
    .filter((p) => !seen.has(model(p)) && seen.add(model(p)))
    .slice(0, MAX_PRODUCTS)
}

interface Page {
  section: Universe
  slug: string
  title: string
  h1: string
  intro: string
  items: Product[]
  group: string
  /** Pagine degli outfit: look completi al posto della griglia di prodotti */
  outfits?: Outfit[]
}
const pages: Page[] = []
const add = (page: Omit<Page, 'items'>, list: Product[]) => {
  if (list.length >= MIN_PRODUCTS) pages.push({ ...page, items: pick(list) })
}
const forGender = (list: Product[], g: 'uomo' | 'donna') => list.filter((p) => p.gender === g || p.gender === 'unisex')
const pathOf = (pg: Pick<Page, 'section' | 'slug'>) => `/${pg.section}/${pg.slug}/`

// --- Moda: categorie (anche per uomo e donna), marche, offerte ---
for (const group of groupsOf('moda')) {
  for (const item of group.items) {
    const list = products.filter((p) => p.category === item.id)
    const label = item.label
    const lower = label.toLowerCase()
    const slug = slugify(label)
    add(
      {
        section: 'moda',
        slug,
        group: group.label,
        title: `${label} di marca: offerte e novità | Swipe Shopping`,
        h1: `${label} di marca`,
        intro: `Le migliori ${lower} dei marchi più amati, con prezzi aggiornati e sconti. Salva quelle che ti piacciono e acquistale in un tocco.`,
      },
      list,
    )
    for (const g of ['donna', 'uomo'] as const) {
      add(
        {
          section: 'moda',
          slug: `${slug}-${g}`,
          group: group.label,
          title: `${label} da ${g} di marca: offerte | Swipe Shopping`,
          h1: `${label} da ${g}`,
          intro: `${label} da ${g} dei migliori marchi, scelte una per una e con lo sconto in evidenza.`,
        },
        forGender(list, g),
      )
    }
  }
}

const moda = products.filter((p) => universeOf(p.category) === 'moda')
const byBrand = (list: Product[]) => {
  const map = new Map<string, Product[]>()
  for (const p of list) if (p.brand) map.set(p.brand, [...(map.get(p.brand) ?? []), p])
  return map
}

for (const [brand, list] of byBrand(moda)) {
  // Marche di soli profumi (Dior, Lancôme…): il testo parla di profumi, non di abbigliamento.
  const what = list.every((p) => p.category === 'profumi') ? 'profumi' : 'abbigliamento, scarpe e accessori'
  add(
    {
      section: 'moda',
      slug: `marca-${slugify(brand)}`,
      group: 'Marche',
      title: `${brand}: ${what} in offerta | Swipe Shopping`,
      h1: `${brand} in offerta`,
      intro: `Tutti i prodotti ${brand} che trovi su Swipe Shopping: ${what} con prezzi aggiornati.`,
    },
    list,
  )
}

const deals = moda.filter((p) => (price(p)?.off ?? 0) > 0)
add(
  {
    section: 'moda',
    slug: 'offerte',
    group: 'Offerte',
    title: 'Offerte moda di oggi: abbigliamento e scarpe scontati | Swipe Shopping',
    h1: 'Offerte moda di oggi',
    intro: 'Abbigliamento, scarpe e accessori di marca scontati almeno del 5%, aggiornati più volte al giorno.',
  },
  deals,
)
for (const g of ['donna', 'uomo'] as const) {
  add(
    {
      section: 'moda',
      slug: `offerte-${g}`,
      group: 'Offerte',
      title: `Offerte moda ${g}: abbigliamento e scarpe scontati | Swipe Shopping`,
      h1: `Offerte moda ${g}`,
      intro: `Abbigliamento, scarpe e accessori da ${g} in sconto, dei migliori marchi.`,
    },
    forGender(deals, g),
  )
}

// --- Outfit: una pagina per stile e genere, con look completi fatti dai capi del catalogo ---
const MAX_OUTFITS = 12
const STYLE_TEXT: Record<OutfitStyle, string> = {
  casual: 'per tutti i giorni: jeans, sneakers e una felpa o una camicia',
  smart: 'a metà tra casual ed elegante: camicia o maglione con i jeans e scarpe curate',
  elegante: 'eleganti: camicia, pantaloni e scarpe eleganti, con cappotto e accessori',
  ufficio: "da ufficio: camicia, pantaloni, scarpe eleganti e giacca",
  nero: 'total black: tutto nero, dalla testa ai piedi',
  vestito: 'con il vestito: abito, scarpe, borsa e giacca abbinati',
  serata: 'da sera: vestito, scarpe eleganti, borsa e un gioiello',
  weekend: 'per il weekend: giacca, jeans, scarpe comode e zaino',
  sportivo: 'sportivi: felpa, pantaloni da tuta o leggings e scarpe da ginnastica',
}
for (const g of ['donna', 'uomo'] as const) {
  const all = buildOutfits(moda, g)
  for (const style of Object.keys(STYLE_LABEL) as OutfitStyle[]) {
    const list = all.filter((o) => o.style === style && outfitTotal(o.items) !== null).slice(0, MAX_OUTFITS)
    if (list.length < 3) continue
    const label = STYLE_LABEL[style]
    pages.push({
      section: 'moda',
      slug: `outfit-${g}-${slugify(label)}`,
      group: 'Outfit',
      title: `Outfit ${label.toLowerCase()} ${g}: idee e look completi | Swipe Shopping`,
      h1: `Outfit ${label.toLowerCase()} da ${g}`,
      intro: `Idee di outfit ${STYLE_TEXT[style]}. Look completi da ${g} con capi di marca abbinati per colore, ognuno con il suo prezzo e il link al negozio.`,
      items: list.flatMap((o) => o.items),
      outfits: list,
    })
  }
}

// --- Tech, Gadget, Snack: categorie, marche, offerte (niente uomo/donna) ---
const OTHER = {
  tech: { what: 'prodotti tech', deals: 'Offerte tech di oggi: cuffie, smartphone, gaming', dealsH1: 'Offerte tech di oggi',
    dealsIntro: 'Cuffie, smartphone, smartwatch, console e videogiochi scontati almeno del 5%, aggiornati più volte al giorno.' },
  gadget: { what: 'gadget e idee regalo', deals: 'Idee regalo in offerta: gadget, giochi e LEGO', dealsH1: 'Idee regalo in offerta oggi',
    dealsIntro: 'Gadget, lampade, tazze, giochi da tavolo, LEGO e regali curiosi scontati almeno del 5%, aggiornati più volte al giorno.' },
  snack: { what: 'snack, dolci e caffè', deals: 'Offerte snack di oggi: cioccolato, caramelle, caffè', dealsH1: 'Offerte snack di oggi',
    dealsIntro: 'Cioccolato, caramelle, biscotti, patatine, snack proteici, caffè e tè scontati almeno del 5%, aggiornati più volte al giorno.' },
  beauty: { what: 'profumi, trucco e cura della persona', deals: 'Offerte beauty di oggi: profumi, trucco, skincare', dealsH1: 'Offerte beauty di oggi',
    dealsIntro: 'Profumi, trucco, creme viso, shampoo, phon, piastre e rasoi delle migliori marche scontati almeno del 5%, aggiornati più volte al giorno.' },
  casa: { what: 'casa, cucina e design', deals: 'Offerte casa di oggi: cucina, design, robot', dealsH1: 'Offerte casa di oggi',
    dealsIntro: 'Piccoli elettrodomestici, pentole, oggetti di design, candele, robot aspirapolvere e domotica scontati almeno del 5%, aggiornati più volte al giorno.' },
  animali: { what: 'accessori per cani e gatti', deals: 'Offerte per animali: cani e gatti', dealsH1: 'Offerte per cani e gatti di oggi',
    dealsIntro: 'Pettorine, cucce, tiragraffi, fontanelle, giochi e snack per cani e gatti scontati almeno del 5%, aggiornati più volte al giorno.' },
} as const
for (const section of ['beauty', 'tech', 'casa', 'gadget', 'snack', 'animali'] as const) {
  const t = OTHER[section]
  const list = products.filter((p) => universeOf(p.category) === section)
  for (const group of groupsOf(section)) {
    for (const item of group.items) {
      const label = item.label
      add(
        {
          section,
          slug: slugify(label),
          group: group.label,
          title: `${label} in offerta: i migliori modelli | Swipe Shopping`,
          h1: `${label} in offerta`,
          intro: `${label} delle migliori marche con prezzi aggiornati e sconti in evidenza. Salva quelli che ti piacciono e confrontali con calma.`,
        },
        products.filter((p) => p.category === item.id),
      )
    }
  }
  for (const [brand, byB] of byBrand(list)) {
    add(
      {
        section,
        slug: `marca-${slugify(brand)}`,
        group: 'Marche',
        title: `${brand} in offerta: ${t.what} | Swipe Shopping`,
        h1: `${brand} in offerta`,
        intro: `I prodotti ${brand} che trovi su Swipe Shopping, con prezzi aggiornati e sconti.`,
      },
      byB,
    )
  }
  add(
    { section, slug: 'offerte', group: 'Offerte', title: `${t.deals} | Swipe Shopping`, h1: t.dealsH1, intro: t.dealsIntro },
    list.filter((p) => (price(p)?.off ?? 0) > 0),
  )
}

const CSS = `
:root{color-scheme:light dark;--bg:#fafafa;--card:#fff;--text:#171717;--muted:#737373;--line:#e5e5e5;--accent:#f43f5e}
@media (prefers-color-scheme:dark){:root{--bg:#0e0e10;--card:#1c1c1f;--text:#f4f4f6;--muted:#9d9da4;--line:#34343a}}
*{box-sizing:border-box}body{margin:0;font-family:Inter,-apple-system,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.5}
a{color:inherit}header{display:flex;justify-content:space-between;align-items:center;max-width:1100px;margin:0 auto;padding:14px 16px}
.logo{font-weight:900;font-size:20px;text-decoration:none;letter-spacing:-.02em}.logo span{color:var(--accent)}
.cta{background:var(--accent);color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:999px;font-size:14px}
main{max-width:1100px;margin:0 auto;padding:0 16px 32px}h1{font-size:28px;line-height:1.2;margin:12px 0 6px}.intro{color:var(--muted);margin:0 0 6px}
.note{color:var(--muted);font-size:12px;margin:0 0 18px}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;list-style:none;padding:0;margin:0}
@media(min-width:640px){.grid{grid-template-columns:repeat(3,1fr)}}@media(min-width:960px){.grid{grid-template-columns:repeat(4,1fr)}}
.card{background:var(--card);border-radius:16px;overflow:hidden;border:1px solid var(--line);display:flex;flex-direction:column}
.img{position:relative;aspect-ratio:1;background:#fff;display:block}.img img{width:100%;height:100%;object-fit:contain;padding:12px}
.off{position:absolute;left:8px;bottom:8px;background:var(--accent);color:#fff;font-weight:800;font-size:12px;padding:2px 8px;border-radius:999px}
.body{padding:10px 12px 12px;display:flex;flex-direction:column;gap:4px;flex:1}.brand{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:600}
.title{font-size:14px;font-weight:500;margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.price{font-weight:700;margin-top:auto}.buy{margin-top:6px;text-align:center;background:var(--text);color:var(--bg);text-decoration:none;font-weight:600;font-size:14px;padding:8px;border-radius:999px}
.outfits{grid-template-columns:1fr}@media(min-width:640px){.outfits{grid-template-columns:repeat(2,1fr)}}@media(min-width:960px){.outfits{grid-template-columns:repeat(3,1fr)}}
.ogrid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:6px;background:var(--line)}.oimg{aspect-ratio:1;background:#fff;border-radius:10px;overflow:hidden;display:block}
.oimg img{width:100%;height:100%;object-fit:contain;padding:6px}.olist{list-style:none;padding:0;margin:4px 0 0;font-size:13px;display:flex;flex-direction:column;gap:4px}
.links{margin-top:32px}.links h2{font-size:16px;margin:20px 0 8px}.links ul{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0;margin:0}
.links a{display:inline-block;border:1px solid var(--line);background:var(--card);border-radius:999px;padding:6px 12px;font-size:13px;text-decoration:none}
footer{max-width:1100px;margin:0 auto;padding:16px;color:var(--muted);font-size:12px;border-top:1px solid var(--line)}footer p{margin:0 0 8px;font-size:13px}
.crumbs{font-size:13px;color:var(--muted);margin:4px 0 0}.crumbs a{text-decoration:none}
.prod{display:grid;gap:20px}@media(min-width:760px){.prod{grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start}}
.pimg{background:#fff;border-radius:20px;border:1px solid var(--line);aspect-ratio:1;display:flex}.pimg img{width:100%;height:100%;object-fit:contain;padding:20px}
.pinfo h1{font-size:24px}.big{font-size:26px;font-weight:800}.was{color:var(--muted);text-decoration:line-through;margin-left:8px;font-weight:400;font-size:16px}
.btns{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0}.btns a{flex:1;min-width:150px;text-align:center}.ghost{border:1px solid var(--line);background:var(--card);text-decoration:none;font-weight:600;padding:10px 18px;border-radius:999px;font-size:14px}
.feat{padding-left:20px;margin:8px 0}.feat li{margin:4px 0}.meta{color:var(--muted);font-size:14px;margin:0}`

/** Briciole di pane: Home › Sezione › Pagina, visibili e per Google (BreadcrumbList). */
type Crumb = { name: string; path: string }
const sectionCrumb = (section: Universe): Crumb => ({ name: sectionOf(section).label, path: `/${section}/` })

const ORG = {
  '@type': 'Organization',
  '@id': `${SITE}/#org`,
  name: 'Swipe Shopping',
  url: `${SITE}/`,
  logo: `${SITE}/icons/icon-512.png`,
  sameAs: Object.values(SOCIAL_LINKS),
}

function layout(opts: {
  title: string
  description: string
  path: string
  body: string
  jsonLd?: object[]
  section: Universe
  crumbs?: Crumb[]
  image?: string
  ogType?: string
}) {
  const crumbs = [{ name: 'Home', path: '/' }, ...(opts.crumbs ?? [])]
  const graph = [
    ORG,
    ...(crumbs.length > 1
      ? [
          {
            '@type': 'BreadcrumbList',
            itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `${SITE}${c.path}` })),
          },
        ]
      : []),
    ...(opts.jsonLd ?? []),
  ]
  const nav =
    crumbs.length > 1
      ? `<nav class="crumbs" aria-label="Percorso">${crumbs
          .map((c, i) => (i === crumbs.length - 1 ? `<span>${esc(c.name)}</span>` : `<a href="${c.path}">${esc(c.name)}</a>`))
          .join(' › ')}</nav>`
      : ''
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${SITE}${opts.path}">
<link rel="icon" type="image/png" href="/icons/favicon-64.png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="preconnect" href="https://m.media-amazon.com">
<meta property="og:type" content="${opts.ogType ?? 'website'}">
<meta property="og:site_name" content="Swipe Shopping">
<meta property="og:locale" content="it_IT">
<meta property="og:title" content="${esc(opts.title)}">
<meta property="og:description" content="${esc(opts.description)}">
<meta property="og:url" content="${SITE}${opts.path}">
<meta property="og:image" content="${esc(opts.image ?? `${SITE}/icons/og-image.png`)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/seo.css">
<style>:root{--accent:${sectionOf(opts.section).color}}</style>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')}</script>
</head>
<body>
<header><a class="logo" href="/">Swipe<span>Shopping</span></a><a class="cta" href="/${opts.section === 'moda' ? '' : `?sezione=${opts.section}`}#/scopri">Apri l'app</a></header>
<main>${nav}${opts.body}</main>
<footer><p>${SECTIONS.map((x) => `<a href="/${x.id}/">${x.label}</a>`).join(' · ')} · <a href="/moda/outfit/">Outfit</a></p>I link verso i negozi sono link di affiliazione: se acquisti, potremmo ricevere una commissione senza costi aggiuntivi per te. In qualità di Affiliato Amazon, ricevo un guadagno dagli acquisti idonei. Prezzi e disponibilità sono indicativi e possono cambiare: fa fede quello mostrato dal negozio al momento dell'acquisto. · <a href="/#/privacy">Privacy e termini</a></footer>
</body>
</html>
`
}

// --- Pagine prodotto: una per ogni prodotto mostrato nelle pagine di categoria, marca, offerte e outfit ---
const productPath = (p: Product) => `/prodotto/${slugify(p.title).slice(0, 70).replace(/-[^-]*$/, '')}-${slugify(p.externalId)}/`
const paged = new Map<string, Product>()

function card(p: Product) {
  const pr = price(p)
  const url = productUrl(p)
  // Il link va alla pagina del prodotto (che Google può leggere); senza pagina, all'app.
  const app = paged.has(p.id) ? productPath(p) : `/#/p/${encodeURIComponent(p.id)}`
  return `<li class="card"><a class="img" href="${app}"><img src="${esc(p.imageUrl!)}" alt="${esc(p.title)}" loading="lazy" decoding="async" width="300" height="300">${pr?.off ? `<span class="off">-${pr.off}%</span>` : ''}</a><div class="body"><span class="brand">${esc(p.brand ?? '')}</span><h3 class="title"><a href="${app}" style="text-decoration:none">${esc(p.title)}</a></h3>${pr ? `<span class="price">${pr.text}</span>` : ''}${url ? `<a class="buy" href="${esc(url)}" rel="sponsored nofollow noopener" target="_blank">Vedi su ${STORES[p.store].name}</a>` : ''}</div></li>`
}

/** Un look: le foto dei capi affiancate (non modificate), il totale e l'elenco dei capi con i link. */
function outfitCard(o: Outfit) {
  const total = outfitTotal(o.items)
  const thumbs = o.items
    .map((p) => `<a class="oimg" href="${paged.has(p.id) ? productPath(p) : `/#/p/${encodeURIComponent(p.id)}`}" title="${esc(p.title)}"><img src="${esc(p.imageUrl!)}" alt="${esc(p.title)}" loading="lazy" decoding="async" width="150" height="150"></a>`)
    .join('')
  const rows = o.items
    .map((p) => {
      const pr = price(p)
      const url = productUrl(p)
      return `<li><span class="brand">${esc(p.brand ?? '')}</span> ${esc(p.title)}${pr ? ` · <b>${pr.text}</b>` : ''}${url ? ` · <a href="${esc(url)}" rel="sponsored nofollow noopener" target="_blank">Vedi su ${STORES[p.store].name}</a>` : ''}</li>`
    })
    .join('')
  // 4 capi o meno: 2 per riga (niente buchi), altrimenti 3.
  return `<li class="card outfit"><div class="ogrid" style="grid-template-columns:repeat(${o.items.length <= 4 ? 2 : 3},1fr)">${thumbs}</div><div class="body"><span class="brand">Outfit ${esc(STYLE_LABEL[o.style].toLowerCase())} · ${o.items.length} capi</span>${total !== null ? `<span class="price">Totale ${eur.format(total)}</span>` : ''}<ul class="olist">${rows}</ul></div></li>`
}

/** Card leggera per i "simili" nelle pagine prodotto: foto, nome e prezzo, verso la sua pagina. */
function mini(p: Product) {
  const pr = price(p)
  return `<li class="card"><a class="img" href="${productPath(p)}"><img src="${esc(p.imageUrl!)}" alt="" loading="lazy" decoding="async" width="300" height="300"></a><div class="body"><span class="brand">${esc(p.brand ?? '')}</span><a class="title" href="${productPath(p)}" style="text-decoration:none">${esc(p.title)}</a>${pr ? `<span class="price">${pr.text}</span>` : ''}</div></li>`
}

function linksSection(section: Universe, current: string) {
  const groups = new Map<string, Page[]>()
  for (const pg of pages)
    if (pg.section === section && pg.slug !== current && !/-(uomo|donna)$/.test(pg.slug)) groups.set(pg.group, [...(groups.get(pg.group) ?? []), pg])
  return `<nav class="links">${[...groups]
    .map(([g, list]) => `<h2>${esc(g)}</h2><ul>${list.map((pg) => `<li><a href="${pathOf(pg)}">${esc(pg.h1)}</a></li>`).join('')}</ul>`)
    .join('')}${otherSection(section)}</nav>`
}

const otherSection = (section: Universe) =>
  `<h2>Altre sezioni</h2><ul>${SECTIONS.filter((x) => x.id !== section)
    .map((x) => `<li><a href="/${x.id}/">${x.label}: ${esc(x.hint.toLowerCase())}</a></li>`)
    .join('')}</ul>`

for (const pg of pages) for (const p of pg.items) paged.set(p.id, p)

// Caratteristiche dei prodotti (testo unico per ogni pagina)
const details: Record<string, ProductDetails> = {}
for (let n = 0; n < DETAIL_SHARDS; n++) {
  const f = new URL(`details/${n}.json`, dist)
  if (existsSync(f)) Object.assign(details, JSON.parse(readFileSync(f, 'utf8')))
}

/** Pagine dei gruppi in cui compare la categoria del prodotto (per le briciole e i link). */
const categoryPage = (p: Product) => {
  const section = universeOf(p.category)
  const label = categoryLabel(p.category)
  return pages.find((pg) => pg.section === section && pg.slug === slugify(label))
}

const byCategory = new Map<string, Product[]>()
for (const p of paged.values()) byCategory.set(p.category, [...(byCategory.get(p.category) ?? []), p])

for (const p of paged.values()) {
  const section = universeOf(p.category)
  const cat = categoryPage(p)
  const pr = price(p)
  const url = productUrl(p)
  const feats = (details[p.id]?.features ?? []).slice(0, 8)
  const label = categoryLabel(p.category)
  const similar = (byCategory.get(p.category) ?? [])
    .filter((x) => x.id !== p.id && (p.gender === 'unisex' || x.gender === p.gender || x.gender === 'unisex'))
    .sort((a, b) => score(b) - score(a))
    .slice(0, 6)
  const brand = p.brand ? `${p.brand} ` : ''
  const shortTitle = p.title.length > 70 ? `${p.title.slice(0, 67).replace(/\s\S*$/, '')}…` : p.title
  const description = `${p.title}${pr ? ` a ${pr.text}${pr.off ? ` (-${pr.off}%)` : ''}` : ''}. ${label} ${brand}su Swipe Shopping: prezzo aggiornato, caratteristiche e prodotti simili.`
  const body = `<div class="prod"><div class="pimg"><img src="${esc(p.imageUrl!)}" alt="${esc(p.title)}" width="600" height="600" fetchpriority="high"></div>
<div class="pinfo"><p class="meta">${esc([p.brand, label, p.gender !== 'unisex' && section === 'moda' ? p.gender : ''].filter(Boolean).join(' · '))}</p><h1>${esc(p.title)}</h1>
${pr ? `<p class="big">${pr.text}${p.originalPrice && pr.off ? `<span class="was">${eur.format(p.originalPrice)}</span>` : ''}</p><p class="meta">Prezzo aggiornato il ${builtLabel}</p>` : ''}
<div class="btns">${url ? `<a class="cta" href="${esc(url)}" rel="sponsored nofollow noopener" target="_blank">Vedi su ${STORES[p.store].name}</a>` : ''}<a class="ghost" href="/${section === 'moda' ? '' : `?sezione=${section}`}#/p/${encodeURIComponent(p.id)}">Apri nell'app</a></div>
${feats.length ? `<h2>Caratteristiche</h2><ul class="feat">${feats.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}</div></div>
${similar.length ? `<section class="links"><h2>${esc(label)} simili</h2><ul class="grid">${similar.map(mini).join('')}</ul></section>` : ''}
<nav class="links">${cat ? `<h2>Vedi anche</h2><ul><li><a href="${pathOf(cat)}">${esc(cat.h1)}</a></li>${p.brand && pages.some((x) => x.section === section && x.slug === `marca-${slugify(p.brand!)}`) ? `<li><a href="/${section}/marca-${slugify(p.brand)}/">${esc(p.brand)} in offerta</a></li>` : ''}</ul>` : ''}${otherSection(section)}</nav>`
  const dir = new URL(`.${productPath(p)}`, dist)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    new URL('index.html', dir),
    layout({
      title: `${shortTitle}${pr ? ` a ${pr.text}` : ''} | Swipe Shopping`,
      description,
      path: productPath(p),
      section,
      body,
      image: p.imageUrl,
      ogType: 'product',
      crumbs: [sectionCrumb(section), ...(cat ? [{ name: cat.h1, path: pathOf(cat) }] : []), { name: shortTitle, path: productPath(p) }],
      jsonLd: [
        {
          '@type': 'Product',
          name: p.title,
          image: [p.imageUrl, ...(details[p.id]?.images ?? []).slice(0, 4)],
          ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand } } : {}),
          category: label,
          sku: p.externalId,
          ...(feats.length ? { description: feats.join(' ').slice(0, 500) } : {}),
          ...(pr && url
            ? {
                offers: {
                  '@type': 'Offer',
                  price: p.price,
                  priceCurrency: 'EUR',
                  availability: 'https://schema.org/InStock',
                  url,
                  seller: { '@type': 'Organization', name: STORES[p.store].name },
                },
              }
            : {}),
        },
      ],
    }),
  )
}

for (const pg of pages) {
  const genderLinks = pages.filter((x) => x.section === pg.section && (x.slug === `${pg.slug}-donna` || x.slug === `${pg.slug}-uomo`))
  const body = `<h1>${esc(pg.h1)}</h1><p class="intro">${esc(pg.intro)}</p>
<p class="note">${pg.outfits ? `${pg.outfits.length} outfit` : `${pg.items.length} prodotti`} · prezzi aggiornati il ${builtLabel}${
    genderLinks.length ? ` · ${genderLinks.map((x) => `<a href="${pathOf(x)}">${x.slug.endsWith('donna') ? 'Donna' : 'Uomo'}</a>`).join(' · ')}` : ''
  }</p>
${
    pg.outfits
      ? `<ul class="grid outfits">${pg.outfits.map(outfitCard).join('')}</ul><p style="margin-top:20px"><a class="cta" href="/#/outfit">Scopri altri outfit nell'app</a></p>`
      : `<ul class="grid">${pg.items.map(card).join('')}</ul>`
  }${linksSection(pg.section, pg.slug)}`
  const dir = new URL(`${pg.section}/${pg.slug}/`, dist)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    new URL('index.html', dir),
    layout({
      title: pg.title,
      description: pg.intro,
      path: pathOf(pg),
      body,
      section: pg.section,
      image: pg.items[0]?.imageUrl,
      crumbs: [sectionCrumb(pg.section), ...(pg.outfits ? [{ name: 'Outfit', path: '/moda/outfit/' }] : []), { name: pg.h1, path: pathOf(pg) }],
      jsonLd: [
        {
          '@type': 'ItemList',
          name: pg.h1,
          itemListElement: (pg.outfits ? [] : pg.items).map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}${productPath(p)}`, name: p.title })),
        },
      ],
    }),
  )
}

// Indice di ogni sezione
const INDEX = {
  moda: {
    title: 'Moda di marca: categorie, marche e offerte | Swipe Shopping',
    description: 'Abbigliamento, scarpe, borse e accessori dei migliori marchi, divisi per categoria e marca, con le offerte del giorno.',
    h1: 'Moda di marca',
  },
  tech: {
    title: 'Tech in offerta: cuffie, smartphone, smartwatch, gaming | Swipe Shopping',
    description: 'Cuffie, auricolari, casse, smartphone, smartwatch, tablet, fotocamere, console e videogiochi delle migliori marche, con le offerte del giorno.',
    h1: 'Tech in offerta',
  },
  gadget: {
    title: 'Idee regalo e gadget curiosi: lampade, tazze, giochi, LEGO | Swipe Shopping',
    description: 'Gadget da cucina, lampade, tazze, giochi da tavolo, rompicapi, LEGO e regali divertenti delle migliori marche, con le offerte del giorno.',
    h1: 'Gadget e idee regalo',
  },
  beauty: {
    title: 'Beauty in offerta: profumi, trucco, skincare, capelli | Swipe Shopping',
    description: 'Profumi, trucco, cura del viso, shampoo, phon, piastre e rasoi delle migliori marche, con le offerte del giorno.',
    h1: 'Beauty in offerta',
  },
  casa: {
    title: 'Casa e cucina in offerta: elettrodomestici, design, robot | Swipe Shopping',
    description: 'Piccoli elettrodomestici, pentole, oggetti di design, candele, biancheria, robot aspirapolvere e domotica delle migliori marche, con le offerte del giorno.',
    h1: 'Casa e cucina in offerta',
  },
  animali: {
    title: 'Accessori per cani e gatti in offerta | Swipe Shopping',
    description: 'Pettorine, cucce, tiragraffi, fontanelle, giochi e snack per cani e gatti delle migliori marche, con le offerte del giorno.',
    h1: 'Cani e gatti: accessori in offerta',
  },
  snack: {
    title: 'Snack in offerta: cioccolato, caramelle, patatine, caffè | Swipe Shopping',
    description: 'Cioccolato, caramelle, biscotti, patatine, frutta secca, snack proteici, caffè e tè delle migliori marche, con le offerte del giorno.',
    h1: 'Snack in offerta',
  },
} as const
for (const section of UNIVERSES) {
  const ix = INDEX[section]
  mkdirSync(new URL(`${section}/`, dist), { recursive: true })
  writeFileSync(
    new URL(`${section}/index.html`, dist),
    layout({
      title: ix.title,
      description: ix.description,
      path: `/${section}/`,
      section,
      crumbs: [sectionCrumb(section)],
      body: `<h1>${ix.h1}</h1><p class="intro">Scegli una categoria, una marca o le offerte del giorno. Oppure apri l'app e scopri i prodotti uno alla volta con uno swipe.</p>${linksSection(section, '')}`,
    }),
  )
}

// Indice degli outfit
{
  const outfitPages = pages.filter((pg) => pg.outfits)
  mkdirSync(new URL('moda/outfit/', dist), { recursive: true })
  writeFileSync(
    new URL('moda/outfit/index.html', dist),
    layout({
      title: 'Idee outfit uomo e donna: look completi di marca | Swipe Shopping',
      description: 'Idee outfit da uomo e da donna: casual, elegante, da ufficio, da sera, sportivo, total black e weekend. Look completi con capi di marca abbinati per colore e prezzi aggiornati.',
      path: '/moda/outfit/',
      section: 'moda',
      crumbs: [sectionCrumb('moda'), { name: 'Outfit', path: '/moda/outfit/' }],
      body: `<h1>Idee outfit</h1><p class="intro">Look completi da uomo e da donna, composti con capi di marca abbinati per colore e stagione. Scegli uno stile, oppure apri l'app e scorri gli outfit uno alla volta: se un capo non ti convince, lo cambi con un tocco.</p>
<nav class="links">${(['donna', 'uomo'] as const)
        .map((g) => `<h2>Outfit ${g}</h2><ul>${outfitPages.filter((pg) => pg.slug.startsWith(`outfit-${g}-`)).map((pg) => `<li><a href="${pathOf(pg)}">${esc(pg.h1)}</a></li>`).join('')}</ul>`)
        .join('')}</nav><p style="margin-top:20px"><a class="cta" href="/#/outfit">Apri gli outfit nell'app</a></p>`,
    }),
  )
}

writeFileSync(new URL('seo.css', dist), CSS.trim())

// Link condivisi dall'app (/s/<codice>/): anteprima con foto, nome e prezzo in WhatsApp, Telegram, iMessage…
// poi chi lo apre finisce nell'app su quel prodotto. Non vanno su Google (noindex, fuori dalla sitemap).
const sharePage = (p: Product) => {
  const pr = price(p)
  const app = `/#/p/${encodeURIComponent(p.id)}`
  const title = `${p.brand && !p.title.toLowerCase().startsWith(p.brand.toLowerCase()) ? `${p.brand} – ` : ''}${p.title}`
  const desc = `${pr ? `${pr.text}${pr.off ? ` (-${pr.off}%)` : ''} su ${STORES[p.store].name} · ` : ''}Scoprilo con uno swipe su Swipe Shopping`
  const canonical = paged.has(p.id) ? `${SITE}${productPath(p)}` : `${SITE}/`
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${canonical}">
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="Swipe Shopping">
<meta property="og:locale" content="it_IT">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}/s/${encodeURIComponent(shareCode(p.id))}/">
<meta property="og:image" content="${esc(p.imageUrl!)}">
<meta property="og:image:alt" content="${esc(p.title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#f43f5e">
<link rel="icon" type="image/png" href="/icons/favicon-64.png">
<script>location.replace(${JSON.stringify(app)})</script>
</head>
<body style="font-family:system-ui,sans-serif;text-align:center;padding:40px 16px">
<p><a href="${app}">Apri ${esc(p.title)} su Swipe Shopping</a></p>
</body>
</html>
`
}
for (const p of products) {
  const dir = new URL(`s/${shareCode(p.id)}/`, dist)
  mkdirSync(dir, { recursive: true })
  writeFileSync(new URL('index.html', dir), sharePage(p))
}

// Pagina 404 di GitHub Pages: un prodotto non più in catalogo porta comunque alle sezioni.
writeFileSync(
  new URL('404.html', dist),
  layout({
    title: 'Pagina non trovata | Swipe Shopping',
    description: 'Questa pagina non esiste più: il prodotto potrebbe essere esaurito.',
    path: '/404.html',
    section: 'moda',
    body: `<h1>Pagina non trovata</h1><p class="intro">Il prodotto potrebbe essere esaurito o non più in catalogo. Ecco dove trovare tutto il resto.</p><nav class="links">${otherSection('moda').replace('Altre sezioni', 'Sezioni')}<h2>Outfit</h2><ul><li><a href="/moda/outfit/">Idee outfit</a></li></ul></nav>`,
  })
    .replace('<meta name="robots" content="index,follow,max-image-preview:large">', '<meta name="robots" content="noindex">')
    // Link condiviso di un prodotto che non ha più la sua paginetta: si apre comunque l'app su quel prodotto.
    .replace(
      '</head>',
      `<script>(function(){var m=location.pathname.match(/^\\/s\\/([^/]+)/);if(!m)return;var c=decodeURIComponent(m[1]);var id=c.indexOf('-')>=0?c.replace('-',':'):'amazon:'+c;location.replace('/#/p/'+encodeURIComponent(id))})()</script>\n</head>`,
    ),
)

// Sitemap con le immagini (Google Immagini porta molte visite per la moda)
const urls: { path: string; images: string[]; product?: Product }[] = [
  { path: '/', images: [] },
  ...UNIVERSES.map((u) => ({ path: `/${u}/`, images: [] })),
  { path: '/moda/outfit/', images: [] },
  ...pages.map((pg) => ({ path: pathOf(pg), images: [] })),
  ...[...paged.values()].map((p) => ({ path: productPath(p), images: [p.imageUrl!], product: p })),
]
const lastmod = builtAt.toISOString().slice(0, 10)
// Massimo 50.000 indirizzi per file: se si supera, si divide in più sitemap con un indice.
const CHUNK = 40000
const chunks = Array.from({ length: Math.ceil(urls.length / CHUNK) }, (_, i) => urls.slice(i * CHUNK, (i + 1) * CHUNK))
const sitemapXml = (list: typeof urls) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${list
    .map((u) => `  <url><loc>${SITE}${u.path}</loc><lastmod>${lastmod}</lastmod>${u.images.map((i) => `<image:image><image:loc>${esc(i)}</image:loc></image:image>`).join('')}</url>`)
    .join('\n')}\n</urlset>\n`
if (chunks.length === 1) writeFileSync(new URL('sitemap.xml', dist), sitemapXml(urls))
else {
  chunks.forEach((c, i) => writeFileSync(new URL(`sitemap-${i + 1}.xml`, dist), sitemapXml(c)))
  writeFileSync(
    new URL('sitemap.xml', dist),
    `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${chunks
      .map((_, i) => `  <sitemap><loc>${SITE}/sitemap-${i + 1}.xml</loc><lastmod>${lastmod}</lastmod></sitemap>`)
      .join('\n')}\n</sitemapindex>\n`,
  )
}
// Elenco semplice degli indirizzi, per IndexNow (Bing, Yandex…) nel workflow di pubblicazione.
// Per IndexNow si mandano solo le pagine cambiate: indici, categorie e prodotti arrivati nell'ultimo giorno e mezzo.
const fresh = (p: Product) => now - Date.parse(p.addedAt) < 36 * 3_600_000
writeFileSync(
  new URL('indexnow-urls.txt', dist),
  urls
    .filter((u) => !u.product || fresh(u.product))
    .map((u) => `${SITE}${u.path}`)
    .join('\n'),
)
writeFileSync(new URL('robots.txt', dist), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`)
console.log(`Pagine per Google: ${pages.length} (+ indici) e ${paged.size} pagine prodotto, sitemap con ${urls.length} indirizzi.`)
