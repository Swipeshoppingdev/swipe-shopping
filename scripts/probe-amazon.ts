// Prova temporanea: quali dati (recensioni, Prime, spedizione) restituisce Amazon al nostro account.
const { AMAZON_CREDENTIAL_ID, AMAZON_CREDENTIAL_SECRET } = process.env
const tok = await fetch('https://api.amazon.co.uk/auth/o2/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ grant_type: 'client_credentials', client_id: AMAZON_CREDENTIAL_ID, client_secret: AMAZON_CREDENTIAL_SECRET, scope: 'creatorsapi::default' }),
}).then((r) => r.json())
const ASINS = ['B0CLJJHN7P', 'B0CT71ZD1C', 'B00GLQR5G4', 'B00BQ4PEW8', 'B0GL7B87SB', 'B0BS1RT9S2']
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function get(resources: string[]) {
  await sleep(1300)
  const res = await fetch('https://creatorsapi.amazon/catalog/v1/getItems', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json', 'x-marketplace': 'www.amazon.it' },
    body: JSON.stringify({ marketplace: 'www.amazon.it', partnerTag: 'mrofferta09-21', languagesOfPreference: ['it_IT'], itemIds: ASINS, resources }),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}
const CANDIDATES = [
  'customerReviews.count', 'customerReviews.starRating',
  'offersV2.listings.type', 'offersV2.listings.merchantInfo', 'offersV2.listings.condition', 'offersV2.listings.loyaltyPoints',
  'offersV2.listings.deliveryInfo', 'offersV2.listings.deliveryInfo.isPrimeEligible', 'offersV2.listings.deliveryInfo.isFreeShippingEligible',
  'offersV2.listings.programEligibility', 'offers.listings.deliveryInfo.isPrimeEligible', 'offers.listings.deliveryInfo.isFreeShippingEligible',
  'offers.listings.programEligibility.isPrimeExclusive', 'offers.summaries.highestPrice',
]
const ok: string[] = []
for (const r of CANDIDATES) {
  const { status, body } = await get(['itemInfo.title', r])
  console.log(`${r}: HTTP ${status}${status === 200 ? '' : ' ' + JSON.stringify(body).slice(0, 300)}`)
  if (status === 200) ok.push(r)
}
const { status, body } = await get(['itemInfo.title', 'offersV2.listings.price', ...ok])
console.log(`Insieme: HTTP ${status}`)
for (const it of body?.itemsResult?.items ?? []) {
  const { itemInfo, ...rest } = it
  console.log(JSON.stringify(rest))
}
if (!body?.itemsResult) console.log(JSON.stringify(body).slice(0, 2000))
