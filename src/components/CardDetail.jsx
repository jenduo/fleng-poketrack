import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { db } from '../firebase'
import { doc, getDoc } from 'firebase/firestore'
import { readCollectionsFromFirestore } from '../lib/collectrStorage'
import { gradeFromCard, gradeFromId } from '../lib/grades'
import PriceHistoryChart, { extractPriceSeries } from './PriceHistoryChart'

const fmtMoney = (v) =>
  v == null ? '—'
  : `A$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function CardDetail() {
  const { productId: rawProductId } = useParams()
  const navigate = useNavigate()
  // Some cards in storage have a missing/null product_id; the Link still
  // renders /card/undefined. Treat those values as "no product id".
  const productId = rawProductId && rawProductId !== 'undefined' && rawProductId !== 'null'
    ? rawProductId : null
  const [collections, setCollections] = useState({})
  const [savedToken, setSavedToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [liveData, setLiveData] = useState(null)
  const [liveError, setLiveError] = useState('')
  const [liveLoading, setLiveLoading] = useState(false)
  const [exchangeRate, setExchangeRate] = useState(1.388888)

  useEffect(() => {
    const load = async () => {
      try {
        const cols = await readCollectionsFromFirestore()
        setCollections(cols)
        const authSnap = await getDoc(doc(db, 'collectr_imports', 'auth'))
        if (authSnap.exists() && authSnap.data().token) setSavedToken(authSnap.data().token)
      } catch (e) {
        console.error('CardDetail load failed', e)
      }
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    fetch('https://api.frankfurter.dev/v1/latest?from=USD&to=AUD')
      .then(r => r.ok ? r.json() : null)
      .then(d => { const r = d?.rates?.AUD; if (typeof r === 'number') setExchangeRate(r) })
      .catch(() => {})
  }, [])

  // Find every saved entry of this product across portfolios (e.g. raw + grade copies).
  const ownedEntries = useMemo(() => {
    const out = []
    Object.entries(collections).forEach(([name, cards]) => {
      ;(cards || []).forEach(card => {
        if (String(card.product_id) === String(productId)) out.push({ ...card, _portfolio: name })
      })
    })
    return out
  }, [collections, productId])

  // Live fetch from Collectr's per-product endpoint for fresh price + any
  // extra fields not in the bulk list response.
  useEffect(() => {
    if (!savedToken || !productId) return
    let cancelled = false
    const ownerUuid = (() => {
      try { return JSON.parse(atob(savedToken.split('.')[1])).username }
      catch { return null }
    })()
    if (!ownerUuid) return

    setLiveLoading(true)
    setLiveError('')
    fetch(`https://api-v2.getcollectr.com/collections/${ownerUuid}/products/${productId}?currency=USD&details=true`, {
      headers: {
        accept: 'application/json, text/plain, */*',
        authorization: savedToken
      }
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Collectr ${r.status}`)
        const j = await r.json()
        if (!cancelled) setLiveData(j)
      })
      .catch((e) => { if (!cancelled) setLiveError(e.message || 'fetch failed') })
      .finally(() => { if (!cancelled) setLiveLoading(false) })

    return () => { cancelled = true }
  }, [savedToken, productId])

  // Prefer the live response when present (fresher prices), fall back to saved.
  // These must be computed before the early returns so the hooks below run on
  // every render (Rules of Hooks).
  const live = liveData?.data || liveData?.product || liveData
  const hero = live || ownedEntries[0] || null

  // Pull price history out of the live response and turn it into chart series.
  // Memoised here (before any early returns) so hook order stays stable.
  const rawHistory =
    hero?.price_history ?? hero?.priceHistory ?? hero?.prices ?? hero?.price_data ?? null
  const priceSeries = useMemo(() => extractPriceSeries(rawHistory), [rawHistory])

  // Split into two charts: one for raw (grade_id 52) and one for PSA grades.
  // Everything else (TAG, CGC, BGS, unmapped) is intentionally hidden.
  const rawSeries = useMemo(
    () => priceSeries.filter(s => String(s.gradeId) === '52'),
    [priceSeries]
  )
  const psaSeries = useMemo(
    () => priceSeries.filter(s => gradeFromId(s.gradeId).company === 'PSA'),
    [priceSeries]
  )

  // Buy/sell markers — Collectr doesn't expose real timestamps, so we map
  // each entry's user_owned_product_id (a monotonic per-action counter) onto
  // the price-history time axis. Ordering is correct, the date is approx.
  const markers = useMemo(() => {
    if (priceSeries.length === 0 || ownedEntries.length === 0) return []
    // Frank-wide id range (across every portfolio) gives us the best-fit
    // mapping of "ID space" to "price-history time space".
    const allIds = []
    Object.values(collections).forEach(cards => (cards || []).forEach(c => {
      const id = parseInt(c.user_owned_product_id, 10)
      if (Number.isFinite(id)) allIds.push(id)
    }))
    if (allIds.length === 0) return []
    const idMin = Math.min(...allIds)
    const idMax = Math.max(...allIds)
    const idRange = idMax - idMin || 1

    // Time domain from the chart's actual data
    const allTimes = priceSeries.flatMap(s => s.points.map(p => +new Date(p.x)))
    if (allTimes.length === 0) return []
    const tMin = Math.min(...allTimes)
    const tMax = Math.max(...allTimes)
    const tRange = tMax - tMin || 1

    return ownedEntries.map(c => {
      const id = parseInt(c.user_owned_product_id, 10) || idMin
      const fraction = (id - idMin) / idRange
      const approxDate = new Date(tMin + fraction * tRange)
      const isSold = (c._portfolio || '').toLowerCase() === 'sold'
      return {
        id: c.id,
        type: isSold ? 'sell' : 'buy',
        portfolio: c._portfolio,
        quantity: parseInt(c.quantity) || 1,
        gradeId: c.grade_id ? String(c.grade_id) : '52',
        approxDate
      }
    })
  }, [priceSeries, ownedEntries, collections])

  const rawMarkers = useMemo(
    () => markers.filter(m => m.gradeId === '52'),
    [markers]
  )
  const psaMarkers = useMemo(
    () => markers.filter(m => gradeFromId(m.gradeId).company === 'PSA'),
    [markers]
  )

  if (loading) {
    return <div className="loading"><div className="loading-spinner" /></div>
  }

  if (!hero) {
    return (
      <div>
        <div className="page-header">
          <span className="kicker">// Card · 404</span>
          <h1>Card not found.</h1>
          <p>Product id <code>{productId}</code> isn't in your saved collections.</p>
        </div>
        <button className="btn btn-secondary" onClick={() => navigate(-1)}>← Back</button>
      </div>
    )
  }

  const name = hero.product_name || '—'
  const set = hero.catalog_group || '—'
  const cardNumber = hero.card_number || ''
  const rarity = hero.rarity || ''
  const subType = hero.product_sub_type || ''
  const condition = hero.card_condition || ''
  const imageUrl = hero.image_url || null
  const ebayLink = hero.ebay_buy_link || null
  const priceUSD = parseFloat(hero.market_price) || 0
  const diffUSD = parseFloat(hero.market_price_diff) || 0
  const pct = parseFloat(hero.market_price_percentage_diff) || 0
  const priceAUD = priceUSD * exchangeRate
  const diffAUD = Math.abs(diffUSD) * exchangeRate
  const isUp = diffUSD > 0
  const deltaColor = isUp ? 'var(--mint, #86e1c0)' : 'var(--danger, #ff8a8a)'

  const totalQty = ownedEntries.reduce((s, c) => s + (parseInt(c.quantity) || 1), 0)

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <button
          onClick={() => navigate(-1)}
          className="btn btn-secondary btn-sm"
        >
          ← Back
        </button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 320px) minmax(0, 1fr)',
        gap: '2rem',
        alignItems: 'start'
      }}>
        {/* === Hero image === */}
        <div>
          <div style={{
            width: '100%',
            borderRadius: '6%',
            overflow: 'hidden',
            background: 'var(--bg-1)'
          }}>
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={name}
                style={{
                  width: '100%',
                  display: 'block',
                  margin: 0,
                  clipPath: 'inset(4.5% round 4%)'
                }}
              />
            ) : (
              <div style={{
                width: '100%', aspectRatio: '2.5/3.5',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--fg-3)'
              }}>No image</div>
            )}
          </div>
          {ebayLink && (
            <a
              href={ebayLink}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm"
              style={{ display: 'block', textAlign: 'center', marginTop: '0.85rem' }}
            >
              Search on eBay ↗
            </a>
          )}
        </div>

        {/* === Info column === */}
        <div>
          <div className="page-header" style={{ marginBottom: '0.85rem' }}>
            <span className="kicker">// Card · {productId}</span>
            <h1 style={{ marginBottom: '0.4rem' }}>{name.trim()}</h1>
            <p>
              {set}
              {cardNumber ? ` · #${cardNumber}` : ''}
              {rarity ? ` · ${rarity}` : ''}
            </p>
            <p style={{ fontSize: '0.78rem', color: 'var(--fg-3)' }}>
              {subType}
              {condition ? ` · ${condition}` : ''}
              {liveLoading ? ' · refreshing…' : ''}
              {liveError ? ` · live fetch failed: ${liveError}` : ''}
            </p>
          </div>

          {/* === Price block === */}
          <div style={{
            background: 'var(--bg-1)',
            border: '1px solid var(--rule)',
            borderRadius: '6px',
            padding: '1.1rem 1.25rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.62rem',
              letterSpacing: '0.22em',
              color: 'var(--accent)',
              textTransform: 'uppercase',
              marginBottom: '0.4rem'
            }}>// Market</div>
            <div style={{
              display: 'flex', alignItems: 'baseline',
              gap: '0.6rem', flexWrap: 'wrap'
            }}>
              <span style={{
                fontFamily: 'var(--font-display)',
                fontVariationSettings: '"opsz" 144',
                fontWeight: 500,
                fontSize: '2.4rem',
                color: 'var(--gold)',
                letterSpacing: '-0.02em'
              }}>{fmtMoney(priceAUD)}</span>
              <span style={{ color: 'var(--fg-3)', fontSize: '0.78rem' }}>
                US${priceUSD.toFixed(4)} · @ {exchangeRate.toFixed(4)}
              </span>
            </div>
            {(diffUSD !== 0 || pct !== 0) && (
              <div style={{ marginTop: '0.5rem', color: deltaColor, fontSize: '0.95rem' }}>
                {isUp ? '▲' : '▼'} {isUp ? '+' : '-'}{fmtMoney(diffAUD).slice(2)}
                {' '}({isUp ? '+' : '-'}{Math.abs(pct).toFixed(2)}%)
              </div>
            )}
          </div>

          {/* === Price history charts === */}
          {rawSeries.length > 0 && (
            <div style={{
              background: 'var(--bg-1)',
              border: '1px solid var(--rule)',
              borderRadius: '6px',
              padding: '1.1rem 1.25rem',
              marginBottom: '1.5rem'
            }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.62rem',
                letterSpacing: '0.22em',
                color: 'var(--accent)',
                textTransform: 'uppercase',
                marginBottom: '0.75rem'
              }}>// Raw · AUD</div>
              <PriceHistoryChart
                series={rawSeries}
                markers={rawMarkers}
                exchangeRate={exchangeRate}
                gradeLabel={gradeFromId}
              />
            </div>
          )}

          {psaSeries.length > 0 && (
            <div style={{
              background: 'var(--bg-1)',
              border: '1px solid var(--rule)',
              borderRadius: '6px',
              padding: '1.1rem 1.25rem',
              marginBottom: '1.5rem'
            }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.62rem',
                letterSpacing: '0.22em',
                color: 'var(--accent)',
                textTransform: 'uppercase',
                marginBottom: '0.75rem'
              }}>// PSA grades · AUD</div>
              <PriceHistoryChart
                series={psaSeries}
                markers={psaMarkers}
                exchangeRate={exchangeRate}
                gradeLabel={gradeFromId}
              />
            </div>
          )}

          {/* === Ownership block === */}
          {ownedEntries.length > 0 && (
            <div style={{
              background: 'var(--bg-1)',
              border: '1px solid var(--rule)',
              borderRadius: '6px',
              padding: '1.1rem 1.25rem',
              marginBottom: '1.5rem'
            }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.62rem',
                letterSpacing: '0.22em',
                color: 'var(--accent)',
                textTransform: 'uppercase',
                marginBottom: '0.6rem'
              }}>// You own · {totalQty}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {ownedEntries.map((c, i) => {
                  const g = gradeFromCard(c)
                  const label = g.isGraded ? `${g.company} ${g.grade}` : (c.card_condition || 'Raw')
                  return (
                    <Link
                      key={c.id || i}
                      to={`/collection?c=${encodeURIComponent(c._portfolio)}`}
                      style={{
                        display: 'flex', justifyContent: 'space-between',
                        padding: '0.5rem 0.65rem',
                        background: 'var(--bg-2)',
                        border: '1px solid var(--rule)',
                        borderRadius: '4px',
                        color: 'var(--fg-0)',
                        textDecoration: 'none',
                        fontSize: '0.85rem'
                      }}
                    >
                      <span>{c._portfolio}</span>
                      <span style={{ color: 'var(--fg-2)', fontFamily: 'var(--font-mono)' }}>
                        {label} · qty {c.quantity || 1}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

export default CardDetail
