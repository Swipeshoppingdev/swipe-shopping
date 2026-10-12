// Prova temporanea: come risponde getVariations della Creators API (taglie per variante). Stampa solo la struttura.
const { AMAZON_CREDENTIAL_ID, AMAZON_CREDENTIAL_SECRET } = process.env
const ASIN = process.env.PROBE_ASIN || 'B0DP7QPRMS'
const tok = await fetch('https://api.amazon.co.uk/auth/o2/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ grant_type: 'client_credentials', client_id: AMAZON_CREDENTIAL_ID, client_secret: AMAZON_CREDENTIAL_SECRET, scope: 'creatorsapi::default' }),
}).then((r) => r.json())
const call = async (op: string, payload: Record<string, unknown>) => {
  await new Promise((r) => setTimeout(r, 1200))
  const res = await fetch(`https://creatorsapi.amazon/catalog/v1/${op}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json', 'x-marketplace': 'www.amazon.it' },
    body: JSON.stringify({ marketplace: 'www.amazon.it', partnerTag: 'mrofferta09-21', languagesOfPreference: ['it_IT'], ...payload }),
  })
  const body = await res.json().catch(() => ({}))
  console.log(`--- ${op} HTTP ${res.status}`)
  return body
}
const items = await call('getItems', { itemIds: [ASIN], itemIdType: 'ASIN', resources: ['itemInfo.title', 'parentASIN'] })
console.log(JSON.stringify(items).slice(0, 800))
const parent = items?.itemsResult?.items?.[0]?.parentASIN ?? ASIN
for (const resources of [
  ['itemInfo.title', 'variationSummary.variationDimension', 'offersV2.listings.availability', 'offersV2.listings.price'],
  ['itemInfo.title', 'offersV2.listings.availability'],
]) {
  const v = await call('getVariations', { asin: parent, variationCount: 10, variationPage: 1, resources })
  const r = v?.variationsResult
  console.log('keys', Object.keys(v ?? {}), 'summary', JSON.stringify(r?.variationSummary ?? v?.errors).slice(0, 1500))
  for (const it of (r?.items ?? []).slice(0, 10)) console.log(JSON.stringify({ asin: it.asin, keys: Object.keys(it), va: it.variationAttributes, title: it.itemInfo?.title?.displayValue, av: it.offersV2?.listings?.[0]?.availability?.type, price: it.offersV2?.listings?.[0]?.price?.money?.amount }))
  if (r) break
}
