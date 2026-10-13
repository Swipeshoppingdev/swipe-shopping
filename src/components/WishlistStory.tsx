import { Camera, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { categoryGroupOf, categoryLabel, sectionOf, type Universe } from '../config/categories'
import type { Product } from '../types/product'

/**
 * "La mia wishlist" in una storia (1080×1920) da condividere su Instagram o TikTok.
 * Solo testo e numeri: niente foto dei prodotti (le immagini Amazon si possono mostrare solo nell'app,
 * non scaricare né pubblicare altrove). In fondo il link swipeshopping.app.
 */
export function WishlistStory({ items, section, deals }: { items: Product[]; section: Universe; deals: number }) {
  const [busy, setBusy] = useState(false)
  const [story, setStory] = useState<{ blob: Blob; url: string } | null>(null)
  useEffect(() => {
    if (!story) return
    return () => URL.revokeObjectURL(story.url)
  }, [story])
  if (items.length < 3) return null
  // Prima l'anteprima, poi "Condividi" con un secondo tocco: Safari apre il menu Condividi solo subito dopo un tocco.
  const file = story ? new File([story.blob], 'la-mia-wishlist.png', { type: 'image/png' }) : null
  const canShare = !!file && !!navigator.canShare?.({ files: [file] })
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            const blob = await drawStory(items, section, deals)
            setStory({ blob, url: URL.createObjectURL(blob) })
          } finally {
            setBusy(false)
          }
        }}
        className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-white px-3.5 text-sm font-semibold ring-1 ring-neutral-200 disabled:opacity-60"
      >
        <Camera className="size-4" />
        {busy ? 'Un attimo…' : 'Crea storia'}
      </button>
      {story && file && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/80 p-6" onClick={() => setStory(null)}>
          <button type="button" aria-label="Chiudi" onClick={() => setStory(null)} className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 grid size-10 place-items-center rounded-full bg-white/15 text-white">
            <X className="size-5" />
          </button>
          <img src={story.url} alt="La tua storia" className="max-h-[70dvh] rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
          {canShare ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                void navigator.share({ files: [file] }).catch(() => {})
              }}
              className="h-12 rounded-full bg-white px-8 font-semibold text-neutral-900"
            >
              Condividi
            </button>
          ) : (
            <a href={story.url} download={file.name} onClick={(e) => e.stopPropagation()} className="grid h-12 place-items-center rounded-full bg-white px-8 font-semibold text-neutral-900">
              Scarica l'immagine
            </a>
          )}
          <p className="text-center text-xs text-white/70">Pubblicala nelle storie di Instagram o TikTok. Se non si apre, tieni premuta l'immagine per salvarla.</p>
        </div>
      )}
    </>
  )
}

const W = 1080
const H = 1920
const FONT = '-apple-system, "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

function top<T>(values: T[], n: number) {
  const count = new Map<T, number>()
  for (const v of values) count.set(v, (count.get(v) ?? 0) + 1)
  return [...count].sort((a, b) => b[1] - a[1]).slice(0, n)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

async function drawStory(items: Product[], section: Universe, deals: number) {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const color = sectionOf(section).color
  const bg = ctx.createLinearGradient(0, 0, W * 0.4, H)
  bg.addColorStop(0, color)
  bg.addColorStop(1, '#171717')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  // Cerchi sfumati di sfondo.
  ctx.fillStyle = 'rgba(255,255,255,0.07)'
  for (const [x, y, r] of [[980, 260, 300], [80, 1500, 360], [900, 1750, 180]]) {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.textAlign = 'center'
  ctx.fillStyle = '#fff'
  const logo = await loadImage('icons/icon-512.png')
  if (logo) {
    ctx.save()
    roundRect(ctx, W / 2 - 80, 110, 160, 160, 40)
    ctx.clip()
    ctx.drawImage(logo, W / 2 - 80, 110, 160, 160)
    ctx.restore()
  }
  ctx.font = `600 44px ${FONT}`
  ctx.globalAlpha = 0.85
  ctx.fillText(`La mia wishlist ${sectionOf(section).label}`, W / 2, 340)
  ctx.globalAlpha = 1
  ctx.font = `800 200px ${FONT}`
  ctx.fillText(String(items.length), W / 2, 540)
  ctx.font = `700 64px ${FONT}`
  ctx.fillText(items.length === 1 ? 'preferito' : 'preferiti salvati', W / 2, 625)

  // Le marche preferite, come pillole.
  let y = 750
  const brands = top(items.flatMap((p) => (p.brand ? [p.brand.trim()] : [])), 5)
  if (brands.length) {
    ctx.font = `600 40px ${FONT}`
    ctx.globalAlpha = 0.8
    ctx.fillText('Le mie marche', W / 2, y)
    ctx.globalAlpha = 1
    y += 40
    ctx.font = `700 44px ${FONT}`
    const pills = brands.map(([b]) => (b.length > 18 ? `${b.slice(0, 17)}…` : b))
    const rows: string[][] = [[]]
    let rowW = 0
    for (const p of pills) {
      const w = ctx.measureText(p).width + 80
      if (rowW + w > W - 120 && rows[rows.length - 1].length) {
        rows.push([])
        rowW = 0
      }
      rows[rows.length - 1].push(p)
      rowW += w + 24
    }
    for (const row of rows) {
      const widths = row.map((p) => ctx.measureText(p).width + 80)
      let x = (W - (widths.reduce((a, b) => a + b, 0) + 24 * (row.length - 1))) / 2
      row.forEach((p, i) => {
        ctx.fillStyle = 'rgba(255,255,255,0.95)'
        roundRect(ctx, x, y, widths[i], 96, 48)
        ctx.fill()
        ctx.fillStyle = '#171717'
        ctx.fillText(p, x + widths[i] / 2, y + 63)
        x += widths[i] + 24
      })
      y += 120
    }
    y += 20
  }

  // Cosa salvo di più: le categorie con la loro emoji.
  const emojiOf = (p: Product) => categoryGroupOf(p.category)?.emoji ?? '⭐'
  const cats = top(items.map((p) => p.category), 3)
  ctx.fillStyle = '#fff'
  ctx.font = `600 40px ${FONT}`
  ctx.globalAlpha = 0.8
  ctx.fillText('Cosa salvo di più', W / 2, y + 30)
  ctx.globalAlpha = 1
  y += 70
  for (const [c, n] of cats) {
    const p = items.find((i) => i.category === c)!
    ctx.fillStyle = 'rgba(255,255,255,0.14)'
    roundRect(ctx, 120, y, W - 240, 100, 32)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'left'
    ctx.font = `600 46px ${FONT}`
    const label = categoryLabel(c)
    ctx.fillText(`${emojiOf(p)}  ${label.length > 26 ? `${label.slice(0, 25)}…` : label}`, 160, y + 67)
    ctx.textAlign = 'right'
    ctx.font = `800 50px ${FONT}`
    ctx.fillText(String(n), W - 160, y + 69)
    ctx.textAlign = 'center'
    y += 116
  }
  if (deals > 0) {
    ctx.font = `700 46px ${FONT}`
    ctx.fillText(deals === 1 ? '🔥 1 è in offerta adesso' : `🔥 ${deals} sono in offerta adesso`, W / 2, y + 60)
  }

  // In fondo: dove farsi la propria.
  ctx.font = `600 42px ${FONT}`
  ctx.globalAlpha = 0.85
  ctx.fillText('Scorri, salva, acquista. Fai la tua su', W / 2, H - 290)
  ctx.globalAlpha = 1
  ctx.fillStyle = '#fff'
  roundRect(ctx, W / 2 - 330, H - 250, 660, 120, 60)
  ctx.fill()
  ctx.fillStyle = color
  ctx.font = `800 58px ${FONT}`
  ctx.fillText('swipeshopping.app', W / 2, H - 170)

  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('immagine'))), 'image/png'))
}
