// Screenshot e grafica per le schede di Google Play e App Store, con i prodotti veri del catalogo.
// Si usa dal workflow "Grafica store" (serve internet per le foto Amazon): node scripts/store/shots.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const OUT = new URL('../../store-out/', import.meta.url)
mkdirSync(new URL('raw/', OUT), { recursive: true })

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const ctx = await browser.newContext({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 3, locale: 'it-IT', colorScheme: 'light' })

async function page(mode, extra = {}) {
  const p = await ctx.newPage()
  const ls = {
    onboarded: true, coachSeen: true, 'analytics:consent': 'denied', 'sectionsMenuSeen:2': true,
    sectionsVisited: ['beauty', 'casa', 'gadget', 'snack', 'animali'], theme: 'light', mode, ...extra,
  }
  await p.addInitScript((entries) => {
    if (sessionStorage.getItem('seeded')) return
    localStorage.clear()
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(`swipeshop:v1:${k}`, JSON.stringify(v))
    sessionStorage.setItem('seeded', '1')
  }, ls)
  return p
}

/** Aspetta che la foto del prodotto in cima sia caricata. */
async function ready(p) {
  await p.waitForFunction(() => [...document.images].some((i) => i.complete && i.naturalWidth > 100 && i.src.startsWith('https://m.media-amazon')), null, { timeout: 30000 }).catch(() => {})
  await p.waitForTimeout(800)
}

const shot = (p, name) => p.screenshot({ path: new URL(`raw/${name}.png`, OUT).pathname })

// 1. Moda: il mazzo
let p = await page('moda')
await p.goto(`${BASE}/#/scopri`)
await ready(p)
await shot(p, '1-moda')
// 3. Scheda prodotto (con "Completa il look" per la moda)
await p.getByRole('button', { name: /^Dettagli di/ }).first().click().catch(() => p.mouse.click(180, 300))
await p.waitForTimeout(2500)
await shot(p, '3-scheda')
await p.close()

// 2. Outfit già pronti
p = await page('moda')
await p.goto(`${BASE}/#/outfit`)
await ready(p)
await p.waitForTimeout(2500)
await shot(p, '2-outfit')
await p.close()

// 4. Menu delle sezioni
p = await page('moda')
await p.goto(`${BASE}/#/scopri`)
await ready(p)
await p.getByRole('button', { name: /cambia sezione/ }).click()
await p.waitForTimeout(500)
await shot(p, '4-sezioni')
await p.close()

// 5-7. Beauty, Tech, Casa (Google Play accetta al massimo 8 screenshot)
for (const [n, mode] of [[5, 'beauty'], [6, 'tech'], [7, 'casa']]) {
  p = await page(mode)
  await p.goto(`${BASE}/#/scopri`)
  await ready(p)
  await shot(p, `${n}-${mode}`)
  await p.close()
}

// 8. Preferiti: salvo alcuni prodotti e apro la pagina
p = await page('moda')
await p.goto(`${BASE}/#/scopri`)
await ready(p)
for (let i = 0; i < 8; i++) {
  await p.getByRole('button', { name: 'Sì, salva nei preferiti' }).click()
  await p.waitForTimeout(450)
}
await p.goto(`${BASE}/#/preferiti`)
await p.waitForTimeout(3000)
await shot(p, '8-preferiti')
await p.close()

// 9. Tema scuro
p = await page('moda', { theme: 'dark' })
await p.goto(`${BASE}/#/scopri`)
await ready(p)
await shot(p, '9-scuro')
await p.close()

// 10-11. Mini giochi: Indovina il prezzo e Gratta lo sconto (partono dopo 10 swipe, qui manca solo l'ultimo)
for (const [name, kind] of [['10-prezzo', 0], ['11-gratta', 6]]) {
  p = await page('moda', { breakCount: 9, breakKind: kind })
  await p.goto(`${BASE}/#/scopri`)
  await ready(p)
  await p.getByRole('button', { name: 'No, scarta' }).click()
  await p.waitForTimeout(2500)
  await shot(p, name)
  await p.close()
}

// --- Screenshot con titolo, 1080x1920 ---
const SLIDES = [
  ['1-moda', 'Scorri. Ti piace? Salvalo.', '#f43f5e'],
  ['2-outfit', 'Migliaia di outfit già pronti', '#6366f1'],
  ['3-scheda', 'Foto, dettagli e prezzo aggiornato', '#f43f5e'],
  ['4-sezioni', 'Moda, beauty, tech, casa e tanto altro', '#171717'],
  ['5-beauty', 'Profumi, trucco e skincare', '#c026d3'],
  ['6-tech', 'Le offerte tech di ogni giorno', '#f97316'],
  ['7-casa', 'Cucina, design e smart home', '#2563eb'],
  ['8-preferiti', 'Tutti i tuoi preferiti in un posto', '#f43f5e'],
]
mkdirSync(new URL('screenshot/', OUT), { recursive: true })
const frame = await browser.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3 })
for (const [name, title, color] of SLIDES) {
  const img = readFileSync(new URL(`raw/${name}.png`, OUT)).toString('base64')
  await frame.setContent(`<!doctype html><html><body style="margin:0;width:360px;height:640px;overflow:hidden;background:${color};font-family:Inter,-apple-system,Roboto,sans-serif">
    <div style="height:118px;display:flex;align-items:center;justify-content:center;padding:0 28px;text-align:center;color:#fff;font-weight:800;font-size:27px;line-height:1.15;letter-spacing:-.02em">${title}</div>
    <div style="margin:0 auto;width:286px;height:508px;border-radius:26px;overflow:hidden;box-shadow:0 18px 40px rgba(0,0,0,.35);border:5px solid #111;background:#fff">
      <img src="data:image/png;base64,${img}" style="width:100%;display:block">
    </div></body></html>`)
  await frame.waitForTimeout(200)
  await frame.screenshot({ path: new URL(`screenshot/${name}.png`, OUT).pathname })
}

// --- Screenshot per l'App Store (iPhone 6,3", 1206x2622): massimo 10, con tema scuro e mini giochi ---
const IOS_SLIDES = [
  SLIDES[0],
  ['10-prezzo', 'Indovina il prezzo tra uno swipe e l\'altro', '#7c3aed'],
  SLIDES[1],
  ['9-scuro', 'Anche con il tema scuro', '#171717'],
  ['11-gratta', 'Gratta e scopri lo sconto', '#16a34a'],
  SLIDES[2], SLIDES[4], SLIDES[5], SLIDES[7], SLIDES[3],
]
mkdirSync(new URL('appstore/', OUT), { recursive: true })
const ios = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 })
for (const [name, title, color] of IOS_SLIDES) {
  const img = readFileSync(new URL(`raw/${name}.png`, OUT)).toString('base64')
  await ios.setContent(`<!doctype html><html><body style="margin:0;width:402px;height:874px;overflow:hidden;background:${color};font-family:Inter,-apple-system,Roboto,sans-serif">
    <div style="height:174px;display:flex;align-items:center;justify-content:center;padding:0 30px;text-align:center;color:#fff;font-weight:800;font-size:33px;line-height:1.12;letter-spacing:-.02em">${title}</div>
    <div style="margin:0 auto;width:354px;border-radius:40px;overflow:hidden;box-shadow:0 22px 50px rgba(0,0,0,.35);border:7px solid #111;background:#fff">
      <img src="data:image/png;base64,${img}" style="width:100%;display:block">
    </div></body></html>`)
  await ios.waitForTimeout(200)
  await ios.screenshot({ path: new URL(`appstore/${name}.png`, OUT).pathname })
}

// --- Grafica in evidenza, 1024x500 ---
const catalog = JSON.parse(readFileSync(new URL('../../public/catalog.json', import.meta.url), 'utf8'))
const pick = (cat) => catalog.find((x) => x.category === cat && x.imageUrl && x.availability !== 'out_of_stock')?.imageUrl
const imgs = ['sneakers', 'profumi', 'cuffie', 'robot', 'costruzioni', 'cioccolato'].map(pick).filter(Boolean)
const logo = readFileSync(new URL('../../public/icons/icon-1024.png', import.meta.url)).toString('base64')
const fg = await browser.newPage({ viewport: { width: 1024, height: 500 } })
await fg.setContent(`<!doctype html><html><body style="margin:0;width:1024px;height:500px;overflow:hidden;background:linear-gradient(135deg,#fff 0%,#fff 48%,#ffe4e9 100%);font-family:Inter,-apple-system,Roboto,sans-serif;display:flex;align-items:center">
  <div style="width:470px;padding-left:56px">
    <img src="data:image/png;base64,${logo}" style="width:330px;margin:-60px 0 -50px -28px">
    <div style="font-size:30px;font-weight:800;color:#171717;line-height:1.2;letter-spacing:-.02em">Scorri, salva e trova<br>le offerte dei migliori marchi</div>
  </div>
  <div style="flex:1;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;padding:30px 44px 30px 10px">
    ${imgs.map((u, i) => `<div style="height:190px;border-radius:24px;background:#fff;box-shadow:0 10px 30px rgba(0,0,0,.12);display:flex;align-items:center;justify-content:center;transform:rotate(${[-3, 2, -2, 2, -2, 3][i]}deg)"><img src="${u}" style="max-width:80%;max-height:80%"></div>`).join('')}
  </div></body></html>`)
await fg.waitForLoadState('networkidle')
await fg.waitForTimeout(1000)
await fg.screenshot({ path: new URL('grafica-in-evidenza.png', OUT).pathname })

await browser.close()
writeFileSync(new URL('README.txt', OUT), 'Generati da scripts/store/shots.mjs\n')
console.log('Grafica store pronta in store-out/')
