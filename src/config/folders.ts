/** Cartelle dei preferiti: solo nomi già pronti (niente testo libero). Il nome è quello salvato nel preferito. */
export const FOLDERS = [
  { name: 'Da comprare', emoji: '🛒' },
  { name: 'Quando scende', emoji: '💸' },
  { name: 'Idee regalo', emoji: '🎁' },
  { name: 'Per me', emoji: '💖' },
  { name: 'Estate', emoji: '☀️' },
  { name: 'Inverno', emoji: '❄️' },
  { name: 'Lavoro', emoji: '💼' },
  { name: 'Sport', emoji: '💪' },
  { name: 'Viaggi', emoji: '✈️' },
  { name: 'Feste', emoji: '🎉' },
  { name: 'Casa', emoji: '🏠' },
  { name: 'Forse', emoji: '🤔' },
] as const

const EMOJI = new Map<string, string>(FOLDERS.map((f) => [f.name, f.emoji]))
const ORDER = new Map<string, number>(FOLDERS.map((f, i) => [f.name, i]))

/** Cartella con gli avvisi: chi la usa riceve gli avvisi offerta solo per questi prodotti (scripts/price-alerts.ts). */
export const WATCH_FOLDER = 'Quando scende'

export const isPresetFolder = (name: string) => EMOJI.has(name)
export const folderEmoji = (name: string) => EMOJI.get(name) ?? '📁'
export const folderLabel = (name: string) => `${folderEmoji(name)} ${name}`

/** Prima le cartelle pronte nel loro ordine, poi quelle vecchie con nome scelto a mano. */
export const compareFolders = (a: string, b: string) =>
  (ORDER.get(a) ?? 99) - (ORDER.get(b) ?? 99) || a.localeCompare(b, 'it')
