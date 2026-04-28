// Pull all of your Collectr collections and write them straight into Firestore.
// Usage:
//   COLLECTR_TOKEN="eyJhbGci..." node scripts/import-collectr.mjs
//
// Reads Firebase config from .env (VITE_FIREBASE_*).

import { initializeApp } from 'firebase/app'
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const envText = fs.readFileSync(path.join(here, '..', '.env'), 'utf8')
const env = Object.fromEntries(
  envText.split('\n').filter(Boolean).map(l => {
    const i = l.indexOf('=')
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
  })
)

const token = process.env.COLLECTR_TOKEN
if (!token) {
  console.error('Set COLLECTR_TOKEN env var (the JWT from app.getcollectr.com Network tab)')
  process.exit(1)
}

const ownerUuid = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8')).username
if (!ownerUuid) { console.error('Could not decode UUID from token'); process.exit(1) }
console.log('Owner UUID:', ownerUuid)

const apiHeaders = {
  authorization: token,
  accept: 'application/json, text/plain, */*',
  origin: 'https://app.getcollectr.com',
  referer: 'https://app.getcollectr.com/',
  'user-agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/147.0.0.0 Mobile Safari/537.36'
}

async function apiGet(url) {
  const r = await fetch(url, { headers: apiHeaders })
  if (!r.ok) {
    const body = await r.text()
    throw new Error(`Collectr ${r.status}: ${body.slice(0, 200)}`)
  }
  return r.json()
}

const colsResp = await apiGet(`https://api-v2.getcollectr.com/accounts/${ownerUuid}/collections`)
const cols = colsResp.data || []
console.log('Collections:', cols.map(c => c.name).join(', '))

const productToCard = (p, name) => ({
  portfolio_name: name,
  category: p.catalog_category_name || 'Pokemon',
  catalog_group: p.catalog_group || '',
  product_name: p.product_name || '',
  card_number: p.card_number || '',
  rarity: p.rarity || '',
  variance: p.product_sub_type || '',
  grade: p.grade_company || '',
  card_condition: p.card_condition || '',
  cost_paid: '0',
  quantity: String(p.quantity ?? '1'),
  market_price: String(p.market_price ?? '0'),
  price_override: '0',
  watchlist: false,
  date_added: '',
  notes: '',
  image_url: p.image_url || null,
  id: `${p.catalog_group}-${p.product_name}-${p.card_number}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
})

const grouped = {}
const newImages = {}
let totalCount = 0

for (const c of cols) {
  const items = []
  let off = 0
  const pageSize = 200
  while (true) {
    const cidParam = c.id === ownerUuid ? '' : `&collectionId=${c.id}`
    const url = `https://api-v2.getcollectr.com/collections/${ownerUuid}/products?limit=${pageSize}&offset=${off}&unstackedView=true${cidParam}`
    const j = await apiGet(url)
    const batch = j.data || []
    items.push(...batch)
    if (batch.length < pageSize) break
    off += batch.length
  }
  grouped[c.name] = items.map(p => productToCard(p, c.name))
  totalCount += items.length
  for (const card of grouped[c.name]) {
    if (card.image_url) {
      const k = `${card.product_name?.trim().toLowerCase()}|${card.catalog_group?.trim().toLowerCase()}`
      newImages[k] = card.image_url
    }
  }
  console.log(`  ${c.name}: ${items.length} cards`)
}

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID
})
const db = getFirestore(app)

const cacheRef = doc(db, 'collectr_imports', 'image_cache')
const existing = (await getDoc(cacheRef)).data()?.images || {}
await setDoc(cacheRef, { images: { ...existing, ...newImages } })
await setDoc(doc(db, 'collectr_imports', 'main'), { collections: grouped })

console.log(`Wrote ${totalCount} cards across ${Object.keys(grouped).length} collections to Firestore.`)
process.exit(0)
