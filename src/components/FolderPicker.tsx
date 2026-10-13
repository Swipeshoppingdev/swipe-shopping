import { Check, X } from 'lucide-react'
import { FOLDERS, WATCH_FOLDER, compareFolders, folderLabel, isPresetFolder } from '../config/folders'
import { useApp } from '../state/AppState'
import type { Product } from '../types/product'

/** Finestra per spostare un preferito in una cartella (nomi già pronti). */
export function FolderPicker({ product, onClose }: { product: Product; onClose: () => void }) {
  const { wishlist, actions } = useApp()
  const current = wishlist.find((w) => w.product.id === product.id)?.folder
  // Cartelle vecchie con un nome scelto a mano: restano finché contengono qualcosa.
  const legacy = [...new Set(wishlist.map((w) => w.folder).filter((f): f is string => !!f && !isPresetFolder(f)))].sort(compareFolders)
  const count = (name: string) => wishlist.filter((w) => w.folder === name).length

  const choose = (folder?: string) => {
    actions.setFolder(product, folder)
    onClose()
  }

  const chip = (name: string) => {
    const on = current === name
    const n = count(name)
    return (
      <button
        key={name}
        type="button"
        onClick={() => choose(on ? undefined : name)}
        aria-pressed={on}
        className={`flex items-center gap-1.5 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold ring-1 active:scale-95 ${
          on ? 'bg-neutral-900 text-white ring-neutral-900' : 'bg-white text-neutral-800 ring-neutral-200'
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate">{folderLabel(name)}</span>
          {name === WATCH_FOLDER && <span className={`block text-[11px] font-normal ${on ? 'text-white/70' : 'text-emerald-700'}`}>🔔 ti avvisiamo</span>}
        </span>
        {on ? <Check className="size-4 shrink-0" /> : n > 0 && <span className="text-xs text-neutral-400">{n}</span>}
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 pb-[8dvh]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Metti in una cartella"
        className="w-full max-w-sm space-y-3 rounded-3xl bg-white p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Metti in una cartella</h2>
          <button type="button" onClick={onClose} aria-label="Chiudi" className="text-neutral-500">
            <X className="size-5" />
          </button>
        </div>
        <p className="line-clamp-1 text-sm text-neutral-500">{product.title}</p>
        <div className="grid max-h-[55dvh] grid-cols-2 gap-2 overflow-y-auto p-0.5">
          {FOLDERS.map((f) => chip(f.name))}
          {legacy.map(chip)}
        </div>
        {current && (
          <button type="button" onClick={() => choose(undefined)} className="w-full text-center text-sm font-medium text-neutral-600 underline">
            Togli dalla cartella
          </button>
        )}
      </div>
    </div>
  )
}
