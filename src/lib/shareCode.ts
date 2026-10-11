/** Codice breve di un prodotto nei link condivisi (/s/<codice>/): l'ASIN per Amazon, "negozio-id" per gli altri. */
export const shareCode = (id: string) => (id.startsWith('amazon:') ? id.slice(7) : id.replace(':', '-'))
export const idFromShareCode = (code: string) => (code.includes('-') ? code.replace('-', ':') : `amazon:${code}`)
