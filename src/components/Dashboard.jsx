import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { readCollectionsFromFirestore } from '../lib/collectrStorage'
import { gradeFromCard } from '../lib/grades'

const SOLD_NAME = 'sold'
const MAIN_NAME = 'main'
const COMING_NAME = 'coming'
const RECENT_LIMIT = 6

const isSoldCollection = (name) => name?.toLowerCase() === SOLD_NAME
const isMainCollection = (name) => name?.toLowerCase() === MAIN_NAME
const isComingCollection = (name) => name?.toLowerCase() === COMING_NAME

// Collectr's API doesn't expose real timestamps on products. The
// per-entry user_owned_product_id is monotonically increasing, so we
// sort by it as a proxy for "most recently added to portfolio".
const recencyKey = (card) => {
  const raw = card?.user_owned_product_id
  if (!raw) return 0
  const n = parseInt(raw, 10)
  return Number.isFinite(n) ? n : 0
}

function CardTile({ card, priceAUD, exchangeRate }) {
  const diffUsd = parseFloat(card.market_price_diff) || 0
  const pct = parseFloat(card.market_price_percentage_diff) || 0
  const hasDelta = diffUsd !== 0 || pct !== 0
  const isUp = diffUsd > 0
  const deltaColor = isUp ? 'var(--mint, #86e1c0)' : 'var(--danger, #ff8a8a)'
  const sign = isUp ? '+' : '-'
  const diffAud = Math.abs(diffUsd) * (exchangeRate || 1)

  const g = gradeFromCard(card)
  const isGraded = g.isGraded
  const gradeLabel = isGraded ? `${g.company} ${g.grade}` : ''

  const imageWrapStyle = {
    width: '100%',
    borderRadius: '6%',
    overflow: 'hidden',
    background: 'var(--bg-1)',
    display: 'block'
  }
  // Clip 4% off each side of the image so the white card border is cropped
  // away. The wrapper's dark bg shows through that clipped strip, reading
  // as a black inset border that sits *inside* the image bounds.
  const imageStyle = {
    width: '100%',
    display: 'block',
    margin: 0,
    clipPath: 'inset(4.5% round 4%)'
  }

  const pid = card.product_id
  const hasPid = pid != null && String(pid).length > 0 && String(pid) !== 'null'
  const Wrapper = hasPid ? Link : 'div'
  const wrapperProps = hasPid ? { to: `/card/${pid}` } : {}

  return (
    <Wrapper
      {...wrapperProps}
      className="pokemon-card"
      style={{
        position: 'relative',
        textDecoration: 'none',
        color: 'inherit',
        display: 'block',
        cursor: hasPid ? 'pointer' : 'default'
      }}
    >
      {parseInt(card.quantity) > 1 && (
        <span className="quantity-badge">x{card.quantity}</span>
      )}

      {isGraded && (
        <div style={{
          background: 'linear-gradient(180deg, #2a2a3e 0%, #1a1a2a 100%)',
          border: '1px solid var(--rule-strong)',
          borderRadius: '4px 4px 0 0',
          padding: '0.4rem 0.55rem',
          textAlign: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.66rem',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--accent-strong, #c9b6ff)'
        }}>
          {gradeLabel}
        </div>
      )}

      <div style={{
        padding: isGraded ? '8% 12%' : 0,
        background: isGraded ? '#0b0b14' : 'transparent',
        border: isGraded ? '1px solid var(--rule-strong)' : 'none',
        borderTop: isGraded ? 'none' : undefined,
        borderRadius: isGraded ? '0 0 4px 4px' : 0
      }}>
        <div style={imageWrapStyle}>
          {card.image_url ? (
            <img src={card.image_url} alt={card.product_name} style={imageStyle} />
          ) : (
            <div style={{
              ...imageStyle,
              clipPath: undefined,
              aspectRatio: '2.5/3.5',
              background: 'linear-gradient(135deg, var(--bg-1) 0%, var(--bg-2) 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--fg-3)', fontSize: '0.8rem', textAlign: 'center', padding: '1rem'
            }}>
              No Image
            </div>
          )}
        </div>
      </div>

      <div className="pokemon-card-info">
        <div className="pokemon-card-name">{card.product_name}</div>
        <div className="pokemon-card-set">{card.catalog_group}</div>
        {priceAUD != null && (
          <div className="pokemon-card-price" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {hasDelta && (
              <span style={{ color: deltaColor, fontSize: '0.85rem' }}>{isUp ? '▲' : '▼'}</span>
            )}
            <span>A${priceAUD.toFixed(2)}</span>
          </div>
        )}
        {hasDelta && (
          <div style={{ fontSize: '0.78rem', color: deltaColor, marginTop: '0.15rem' }}>
            {sign}A${diffAud.toFixed(2)} ({sign}{Math.abs(pct).toFixed(2)}%)
          </div>
        )}
      </div>
    </Wrapper>
  )
}

function StatCard({ label, value, onClick }) {
  return (
    <div
      className="stat-card"
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      style={onClick ? { cursor: 'pointer', transition: 'border-color 160ms, background 160ms' } : undefined}
      onMouseEnter={onClick ? (e) => { e.currentTarget.style.borderColor = 'var(--accent)' } : undefined}
      onMouseLeave={onClick ? (e) => { e.currentTarget.style.borderColor = '' } : undefined}
    >
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{value}</div>
    </div>
  )
}

function Carousel({ children }) {
  const ref = useRef(null)
  const scroll = (dir) => {
    if (!ref.current) return
    const w = ref.current.clientWidth
    ref.current.scrollBy({ left: dir * w * 0.85, behavior: 'smooth' })
  }
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => scroll(-1)}
        aria-label="Scroll left"
        style={{
          position: 'absolute', left: '-0.4rem', top: '50%',
          transform: 'translateY(-50%)', zIndex: 2,
          background: 'rgba(11,11,20,0.85)', backdropFilter: 'blur(6px)',
          border: '1px solid var(--rule-strong)', borderRadius: '999px',
          width: '36px', height: '36px', cursor: 'pointer',
          color: 'var(--fg-0)', fontSize: '1rem'
        }}
      >‹</button>
      <button
        onClick={() => scroll(1)}
        aria-label="Scroll right"
        style={{
          position: 'absolute', right: '-0.4rem', top: '50%',
          transform: 'translateY(-50%)', zIndex: 2,
          background: 'rgba(11,11,20,0.85)', backdropFilter: 'blur(6px)',
          border: '1px solid var(--rule-strong)', borderRadius: '999px',
          width: '36px', height: '36px', cursor: 'pointer',
          color: 'var(--fg-0)', fontSize: '1rem'
        }}
      >›</button>
      <div
        ref={ref}
        className="hide-scrollbar"
        style={{
          display: 'flex', gap: '1rem',
          overflowX: 'auto', overflowY: 'hidden',
          scrollSnapType: 'x mandatory',
          paddingBottom: '0.5rem',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none'
        }}
      >
        {children}
      </div>
    </div>
  )
}

function Dashboard() {
  const navigate = useNavigate()
  const [collections, setCollections] = useState({})
  const [collectionsLoading, setCollectionsLoading] = useState(true)
  const [exchangeRate, setExchangeRate] = useState(1.388888)

  useEffect(() => {
    const load = async () => {
      try {
        setCollections(await readCollectionsFromFirestore())
      } catch (e) {
        console.error('Dashboard: could not load collections', e)
      }
      setCollectionsLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    const fetchRate = async () => {
      try {
        const r = await fetch('https://api.frankfurter.dev/v1/latest?from=USD&to=AUD')
        if (!r.ok) throw new Error(`status ${r.status}`)
        const data = await r.json()
        const rate = data?.rates?.AUD
        if (typeof rate === 'number' && rate > 0) setExchangeRate(rate)
      } catch (e) {
        console.error('Dashboard: rate fetch failed, keeping fallback', e)
      }
    }
    fetchRate()
  }, [])

  const {
    ownedCards, soldCards,
    latestAdditionsOther, latestAdditionsMain, latestSold,
    stats, comingName
  } = useMemo(() => {
    const owned = []
    const main = []
    const other = []
    const sold = []
    const coming = []
    let comingCollectionName = null
    Object.entries(collections).forEach(([name, cards]) => {
      const tagged = (cards || []).map(card => ({ ...card, _portfolio: name }))
      if (isSoldCollection(name)) {
        sold.push(...tagged)
      } else {
        owned.push(...tagged)
        if (isMainCollection(name)) main.push(...tagged)
        else other.push(...tagged)
        if (isComingCollection(name)) {
          coming.push(...tagged)
          comingCollectionName = name
        }
      }
    })

    const sortByRecencyDesc = (arr) =>
      [...arr].sort((a, b) => recencyKey(b) - recencyKey(a))

    const sumValueUSD = (arr) => arr.reduce((sum, c) => {
      const price = parseFloat(c.market_price) || 0
      const qty = parseInt(c.quantity) || 1
      return sum + price * qty
    }, 0)

    return {
      ownedCards: owned,
      soldCards: sold,
      latestAdditionsOther: sortByRecencyDesc(other).slice(0, RECENT_LIMIT),
      latestAdditionsMain: sortByRecencyDesc(main).slice(0, RECENT_LIMIT),
      latestSold: sortByRecencyDesc(sold).slice(0, 12), // more for the carousel
      comingName: comingCollectionName,
      stats: {
        portfolioValueUSD: sumValueUSD(owned),
        soldValueUSD: sumValueUSD(sold),
        comingCount: coming.reduce((s, c) => s + (parseInt(c.quantity) || 1), 0)
      }
    }
  }, [collections])

  if (collectionsLoading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
      </div>
    )
  }

  const portfolioValueAUD = stats.portfolioValueUSD * exchangeRate
  const soldValueAUD = stats.soldValueUSD * exchangeRate
  const hasCollection = ownedCards.length > 0 || soldCards.length > 0
  const fmtMoney = (v) => `A$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const goToCollection = (name) => {
    if (name) navigate(`/collection?c=${encodeURIComponent(name)}`)
    else navigate('/collection')
  }

  return (
    <div>
      <div className="page-header">
        <span className="kicker">// 00 Index</span>
        <h1>The collection at a glance.</h1>
        <p>Inventory, holdings, and recent acquisitions.</p>
      </div>

      <div className="stats-grid">
        <StatCard
          label="Portfolio Value · excl. Sold"
          value={<span className="money">{fmtMoney(portfolioValueAUD)}</span>}
          onClick={() => goToCollection('Main')}
        />
        <StatCard
          label="Sold Value"
          value={<span className="money">{fmtMoney(soldValueAUD)}</span>}
          onClick={() => goToCollection('Sold')}
        />
        <StatCard
          label="Coming"
          value={stats.comingCount}
          onClick={comingName ? () => goToCollection(comingName) : undefined}
        />
      </div>

      <div className="page-header">
        <span className="kicker">/ Recent · all</span>
        <h2>Latest additions</h2>
        <p style={{ fontSize: '0.78rem', color: 'var(--fg-3)' }}>Excludes Main and Sold.</p>
      </div>

      {latestAdditionsOther.length > 0 ? (
        <div className="cards-grid">
          {latestAdditionsOther.map(card => (
            <CardTile
              key={card.id}
              card={card}
              priceAUD={(parseFloat(card.market_price) || 0) * exchangeRate}
              exchangeRate={exchangeRate}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h3>{hasCollection ? 'Nothing recent in side portfolios.' : 'No cards yet!'}</h3>
          <p>
            {hasCollection
              ? 'Cards moved into Trade, Slabs, Sealed, etc. will show here.'
              : 'Set your Collectr token and hit Refresh to pull your collection.'}
          </p>
          {!hasCollection && (
            <Link to="/collection" className="btn btn-primary">
              Go to Collection
            </Link>
          )}
        </div>
      )}

      <div className="page-header" style={{ marginTop: '2.5rem' }}>
        <span className="kicker">/ Recent · main</span>
        <h2>Latest added to Main</h2>
      </div>

      {latestAdditionsMain.length > 0 ? (
        <>
          <div className="cards-grid">
            {latestAdditionsMain.map(card => (
              <CardTile
                key={card.id}
                card={card}
                priceAUD={(parseFloat(card.market_price) || 0) * exchangeRate}
              />
            ))}
          </div>
          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <Link to="/collection" className="btn btn-secondary">
              View Full Collection
            </Link>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <h3>Nothing in Main yet.</h3>
          <p>Cards added to your Main portfolio will appear here.</p>
        </div>
      )}

      <div className="page-header" style={{ marginTop: '2.5rem' }}>
        <span className="kicker">/ Sold</span>
        <h2>Latest sold</h2>
      </div>

      {latestSold.length > 0 ? (
        <Carousel>
          {latestSold.map(card => (
            <div
              key={card.id}
              style={{
                flex: '0 0 auto',
                width: 'clamp(150px, 20%, 200px)',
                scrollSnapAlign: 'start'
              }}
            >
              <CardTile
                card={card}
                priceAUD={(parseFloat(card.market_price) || 0) * exchangeRate}
                exchangeRate={exchangeRate}
              />
            </div>
          ))}
        </Carousel>
      ) : (
        <div className="empty-state">
          <h3>Nothing sold yet.</h3>
          <p>Cards in your "Sold" collection on Collectr will appear here.</p>
        </div>
      )}
    </div>
  )
}

export default Dashboard
