import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { db } from '../firebase'
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore'
import {
  readCollectionsFromFirestore,
  writeCollectionsToFirestore,
  deleteAllPortfolios
} from '../lib/collectrStorage'
import { gradeFromCard } from '../lib/grades'

// Collectr's API rejects requests whose Origin isn't app.getcollectr.com,
// so we route through our Cloudflare Worker which sets the right headers.
const COLLECTR_BASE = 'https://fleng-poketrack.jenniferduong-a.workers.dev/collectr'

function Collection() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [filter, setFilter] = useState('')
  const [sortBy, setSortBy] = useState('dateNewest')
  const [collections, setCollections] = useState({})
  const [selectedCollection, setSelectedCollection] = useState(searchParams.get('c') || 'Main')
  const [loading, setLoading] = useState(true)
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState('')
  const [exchangeRate, setExchangeRate] = useState(1.388888)
  const [showTokenPanel, setShowTokenPanel] = useState(false)
  const [authToken, setAuthToken] = useState('')
  const [savedToken, setSavedToken] = useState('')
  const [tokenSaving, setTokenSaving] = useState(false)
  const [refreshProgress, setRefreshProgress] = useState('')
  const [showTokenHelp, setShowTokenHelp] = useState(false)
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null)

  useEffect(() => {
    loadData()
    fetchExchangeRate()
  }, [])

  // Keep selectedCollection in sync with the ?c= query param when it changes.
  useEffect(() => {
    const fromUrl = searchParams.get('c')
    if (fromUrl && fromUrl !== selectedCollection) setSelectedCollection(fromUrl)
  }, [searchParams])

  const fetchExchangeRate = async () => {
    try {
      const response = await fetch('https://api.frankfurter.dev/v1/latest?from=USD&to=AUD')
      if (!response.ok) throw new Error(`status ${response.status}`)
      const data = await response.json()
      const rate = data?.rates?.AUD
      if (typeof rate === 'number' && rate > 0) setExchangeRate(rate)
    } catch (error) {
      console.error('Error fetching exchange rate, keeping fallback:', error)
    }
  }

  const loadData = async () => {
    try {
      const loadedCollections = await readCollectionsFromFirestore()
      setCollections(loadedCollections)
      const names = Object.keys(loadedCollections)
      if (names.length > 0 && !loadedCollections['Main']) {
        setSelectedCollection(names[0])
      }

      // Load saved auth token
      const authRef = doc(db, 'collectr_imports', 'auth')
      const authSnap = await getDoc(authRef)
      if (authSnap.exists()) {
        const data = authSnap.data()
        if (data.token) {
          setSavedToken(data.token)
          setAuthToken(data.token)
        }
        if (data.lastRefreshedAt) setLastRefreshedAt(data.lastRefreshedAt)
      }
    } catch (error) {
      console.error('Error loading data:', error)
    }
    setLoading(false)
  }

  // Preserve every field Collectr returns (so future features can use them
  // without re-importing) and add a few app aliases / a stable React key.
  // Firestore rejects `undefined`, so coerce missing values to null.
  const productToCard = (product, portfolioName) => {
    const cleaned = {}
    for (const [k, v] of Object.entries(product || {})) {
      cleaned[k] = v === undefined ? null : v
    }
    return {
      ...cleaned,
      portfolio_name: portfolioName,
      // App-side aliases (legacy display code reads these names)
      category: product.catalog_category_name || 'Pokemon',
      variance: product.product_sub_type || '',
      grade: product.grade_company || '',
      // user_owned_product_id is the per-entry primary key — monotonically
      // increasing, so we sort by it as a recency proxy on the Dashboard.
      id: `${product.catalog_group || ''}-${product.product_name || ''}-${product.card_number || ''}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
    }
  }

  const writeImportedCollections = async (grouped) => {
    await writeCollectionsToFirestore(grouped)
    setCollections(grouped)
  }

  const handleSaveToken = async () => {
    setImportError('')
    setImportSuccess('')
    const trimmed = authToken.trim()
    if (!trimmed) {
      setImportError('Token is empty.')
      return
    }
    try {
      JSON.parse(atob(trimmed.split('.')[1]))
    } catch {
      setImportError('Token is not a valid JWT.')
      return
    }
    setTokenSaving(true)
    try {
      await setDoc(doc(db, 'collectr_imports', 'auth'), {
        token: trimmed,
        ...(lastRefreshedAt ? { lastRefreshedAt } : {})
      })
      setSavedToken(trimmed)
      setShowTokenPanel(false)
      setImportSuccess('Token saved.')
    } catch (e) {
      setImportError(e.message || 'Could not save token.')
    } finally {
      setTokenSaving(false)
    }
  }

  const handleClearToken = async () => {
    if (!window.confirm('Clear the saved Collectr token?')) return
    setImportError('')
    setImportSuccess('')
    try {
      await deleteDoc(doc(db, 'collectr_imports', 'auth'))
      setSavedToken('')
      setAuthToken('')
      setLastRefreshedAt(null)
      setImportSuccess('Token cleared.')
    } catch (e) {
      setImportError(e.message || 'Could not clear token.')
    }
  }

  const handleRefresh = async () => {
    setImportError('')
    setImportSuccess('')

    const tokenTrimmed = (savedToken || authToken).trim()
    if (!tokenTrimmed) {
      setImportError('No saved token. Click "Update Token" first.')
      setShowTokenPanel(true)
      return
    }

    setRefreshProgress('Decoding token...')
    try {
      const ownerUuid = (() => {
        try {
          const payload = JSON.parse(atob(tokenTrimmed.split('.')[1]))
          return payload.username
        } catch { return null }
      })()
      if (!ownerUuid) throw new Error('Saved token is invalid. Update it.')

      const apiHeaders = {
        accept: 'application/json, text/plain, */*',
        authorization: tokenTrimmed
      }
      const apiGet = async (url) => {
        const r = await fetch(url, { headers: apiHeaders })
        if (!r.ok) {
          const body = (await r.text()).slice(0, 200)
          if (r.status === 401 || r.status === 403) {
            throw new Error(`Token rejected (${r.status}). Update the token.`)
          }
          throw new Error(`Collectr ${r.status}: ${body}`)
        }
        return r.json()
      }

      setRefreshProgress('Listing collections...')
      const colsResp = await apiGet(`${COLLECTR_BASE}/accounts/${ownerUuid}/collections`)
      const cols = colsResp.data || []

      const grouped = {}
      let totalCount = 0
      for (const c of cols) {
        let off = 0
        const pageSize = 200
        const items = []
        while (true) {
          setRefreshProgress(`Fetching "${c.name}" (${items.length}+)...`)
          const cidParam = c.id === ownerUuid ? '' : `&collectionId=${c.id}`
          // Collectr returns newest-first when sortType=dateAdded&sortOrder=DESC.
          // The response itself has no date field, but user_owned_product_id is
          // monotonic with the sort, so the Dashboard sorts cross-collection by it.
          const url = `${COLLECTR_BASE}/collections/${ownerUuid}/products?limit=${pageSize}&offset=${off}&unstackedView=true&sortType=dateAdded&sortOrder=DESC${cidParam}`
          const j = await apiGet(url)
          const batch = j.data || []
          items.push(...batch)
          if (batch.length < pageSize) break
          off += batch.length
        }
        grouped[c.name] = items.map(p => productToCard(p, c.name))
        totalCount += items.length
      }

      setRefreshProgress(`Processing ${totalCount} cards...`)
      await writeImportedCollections(grouped)

      const ts = Date.now()
      setLastRefreshedAt(ts)
      try {
        await setDoc(doc(db, 'collectr_imports', 'auth'), { token: tokenTrimmed, lastRefreshedAt: ts })
      } catch (e) {
        console.error('Could not update lastRefreshedAt:', e)
      }

      setRefreshProgress('')
      setImportSuccess(`Refreshed ${totalCount} cards across ${Object.keys(grouped).length} collection(s).`)
    } catch (error) {
      console.error('Refresh error:', error)
      setImportError(error.message || 'Failed to refresh from Collectr')
      setRefreshProgress('')
    }
  }

  const handleDeleteAll = async () => {
    if (!window.confirm('Delete ALL imported collections? (Token and saved images stay.)')) {
      return
    }

    try {
      await deleteAllPortfolios(Object.keys(collections))
      setCollections({})
      setSelectedCollection('Main')
    } catch (error) {
      console.error('Error deleting all collections:', error)
    }
  }

  const getAllCards = () => {
    return collections[selectedCollection] || []
  }

  const sortComparators = {
    priceAsc:        (a, b) => (parseFloat(a.market_price) || 0) - (parseFloat(b.market_price) || 0),
    priceDesc:       (a, b) => (parseFloat(b.market_price) || 0) - (parseFloat(a.market_price) || 0),
    priceChangeAsc:  (a, b) => (parseFloat(a.market_price_diff) || 0) - (parseFloat(b.market_price_diff) || 0),
    priceChangeDesc: (a, b) => (parseFloat(b.market_price_diff) || 0) - (parseFloat(a.market_price_diff) || 0),
    pctAsc:          (a, b) => (parseFloat(a.market_price_percentage_diff) || 0) - (parseFloat(b.market_price_percentage_diff) || 0),
    pctDesc:         (a, b) => (parseFloat(b.market_price_percentage_diff) || 0) - (parseFloat(a.market_price_percentage_diff) || 0),
    cardNumAsc:      (a, b) => (parseInt(a.card_number, 10) || 0) - (parseInt(b.card_number, 10) || 0),
    cardNumDesc:     (a, b) => (parseInt(b.card_number, 10) || 0) - (parseInt(a.card_number, 10) || 0),
    nameAsc:         (a, b) => (a.product_name || '').localeCompare(b.product_name || ''),
    nameDesc:        (a, b) => (b.product_name || '').localeCompare(a.product_name || ''),
    dateOldest:      (a, b) => (parseInt(a.user_owned_product_id, 10) || 0) - (parseInt(b.user_owned_product_id, 10) || 0),
    dateNewest:      (a, b) => (parseInt(b.user_owned_product_id, 10) || 0) - (parseInt(a.user_owned_product_id, 10) || 0),
  }

  const getFilteredCards = () => {
    const filtered = getAllCards()
      .filter(card =>
        card.product_name.toLowerCase().includes(filter.toLowerCase()) ||
        card.catalog_group.toLowerCase().includes(filter.toLowerCase()) ||
        card.card_number?.toLowerCase().includes(filter.toLowerCase())
      )
    const cmp = sortComparators[sortBy] || sortComparators.dateNewest
    return [...filtered].sort(cmp)
  }

  const calculateTotalValue = (cards) => {
    return cards.reduce((sum, card) => {
      const price = parseFloat(card.market_price) || 0
      const qty = parseInt(card.quantity) || 1
      return sum + (price * qty)
    }, 0)
  }

  const collectionNames = Object.keys(collections).sort((a, b) => {
    if (a === 'Main') return -1
    if (b === 'Main') return 1
    return a.localeCompare(b)
  })
  const allCards = getAllCards()
  const filteredCards = getFilteredCards()
  const totalValueUSD = calculateTotalValue(allCards)
  const totalValueAUD = totalValueUSD * exchangeRate
  const cardsWithImages = allCards.filter(c => c.image_url).length

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <p>Loading collection...</p>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <span className="kicker">// 01 Holdings</span>
        <h1>Frank's collection.</h1>
        <p>
          {allCards.length} cards · {cardsWithImages} imaged · A${totalValueAUD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        <p style={{ fontSize: '0.75rem', color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', marginTop: '0.25rem' }}>
          USD/AUD {exchangeRate.toFixed(4)}
        </p>

        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            className="btn btn-primary"
            onClick={handleRefresh}
            disabled={!savedToken || !!refreshProgress}
            title={!savedToken ? 'Save a token first' : 'Re-fetch all collections from Collectr'}
          >
            {refreshProgress ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => { setShowTokenPanel(!showTokenPanel); setImportError(''); setImportSuccess(''); }}
          >
            {showTokenPanel ? 'Cancel' : (savedToken ? 'Update Token' : 'Set Token')}
          </button>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.66rem',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: savedToken ? 'var(--mint, #86e1c0)' : 'var(--fg-3, #888)',
            marginLeft: '0.25rem'
          }}>
            {savedToken
              ? `● Token saved${lastRefreshedAt ? ` · ${new Date(lastRefreshedAt).toLocaleString()}` : ''}`
              : '○ No token saved'}
          </span>
        </div>

        {refreshProgress && (
          <p style={{ color: '#4dabf7', marginTop: '0.5rem', fontSize: '0.85rem' }}>{refreshProgress}</p>
        )}
        {importError && !showTokenPanel && (
          <p style={{ color: '#ff6b6b', marginTop: '0.5rem', fontSize: '0.85rem' }}>{importError}</p>
        )}
        {importSuccess && (
          <p style={{ color: '#86e1c0', marginTop: '0.5rem' }}>{importSuccess}</p>
        )}
      </div>

      {showTokenPanel && (
        <div style={{
          background: 'var(--bg-1, #1a1a2e)',
          padding: '1.25rem 1.5rem 1.5rem',
          borderRadius: '6px',
          marginBottom: '2rem',
          border: '1px solid var(--rule, #232336)'
        }}>
          <div style={{
            display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
            gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem'
          }}>
            <div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.66rem', letterSpacing: '0.22em',
                color: 'var(--accent, #9b7eff)', marginBottom: '0.35rem', textTransform: 'uppercase'
              }}>// Collectr Auth</div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 500, letterSpacing: '-0.01em' }}>
                {savedToken ? 'Update saved token' : 'Save your Collectr token'}
              </h3>
            </div>
            <div style={{
              fontSize: '0.78rem', color: 'var(--fg-3, #888)', maxWidth: '320px',
              textAlign: 'right', lineHeight: 1.5
            }}>
              Tokens are semi-permanent. Save once, then hit Refresh anytime to re-pull all collections.
            </div>
          </div>

          <label style={{
            display: 'block', marginBottom: '0.4rem', fontSize: '0.7rem',
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--fg-2, #9a9ab0)', fontFamily: 'var(--font-mono)'
          }}>
            Auth Token
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.85rem' }}>
            <input
              type='password'
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              placeholder='eyJhbGciOi...'
              style={{
                flex: 1, padding: '0.7rem 0.85rem', borderRadius: '4px',
                border: '1px solid var(--rule, #2a2a3e)',
                background: 'var(--bg-2, #0d0d1a)', color: 'var(--fg-0, #fff)',
                fontSize: '0.82rem', fontFamily: 'var(--font-mono)',
                boxSizing: 'border-box', outline: 'none'
              }}
            />
            <button
              onClick={() => setShowTokenHelp(s => !s)}
              style={{
                padding: '0 0.95rem',
                background: showTokenHelp ? 'rgba(155,126,255,0.10)' : 'var(--bg-2, #0d0d1a)',
                border: '1px solid var(--rule, #2a2a3e)',
                color: 'var(--fg-1, #bbb)', borderRadius: '4px',
                cursor: 'pointer', fontSize: '0.74rem',
                fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
                whiteSpace: 'nowrap', textTransform: 'uppercase'
              }}
            >
              {showTokenHelp ? 'Hide' : 'How?'}
            </button>
          </div>

          {showTokenHelp && (
            <div style={{
              marginBottom: '0.95rem', background: 'var(--bg-2, #0d0d1a)',
              border: '1px solid var(--rule, #2a2a3e)', borderRadius: '4px',
              padding: '0.85rem 1rem', fontSize: '0.85rem'
            }}>
              <ol style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--fg-2, #aaa)', lineHeight: 1.7 }}>
                <li>Open <a href='https://app.getcollectr.com' target='_blank' rel='noreferrer' style={{ color: 'var(--accent, #9b7eff)' }}>app.getcollectr.com</a> and log in.</li>
                <li>DevTools (F12 / ⌥⌘I) → Network tab.</li>
                <li>Refresh, click any request to <code>api-v2.getcollectr.com</code>.</li>
                <li>Find the <code>authorization</code> request header.</li>
                <li>Copy its full value (no <code>Bearer</code> prefix) and paste above.</li>
              </ol>
            </div>
          )}

          {importError && (
            <p style={{ color: '#ff6b6b', margin: '0 0 0.6rem', fontSize: '0.85rem' }}>{importError}</p>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              className='btn btn-primary'
              onClick={handleSaveToken}
              disabled={!authToken.trim() || tokenSaving || authToken.trim() === savedToken}
            >
              {tokenSaving ? 'Saving…' : 'Save Token'}
            </button>
            {savedToken && (
              <button
                className='btn btn-secondary'
                onClick={handleClearToken}
                style={{ background: '#3a1f1f', color: '#ff8a8a' }}
              >
                Clear Saved Token
              </button>
            )}
            <button
              className='btn btn-secondary'
              onClick={() => { setShowTokenPanel(false); setAuthToken(savedToken); setImportError(''); }}
            >
              Close
            </button>
          </div>
        </div>
      )}



      {collectionNames.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {collectionNames.map(name => (
              <button
                key={name}
                className={`btn ${selectedCollection === name ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => {
                  setSelectedCollection(name)
                  setSearchParams({ c: name })
                }}
                style={{ fontSize: '0.85rem' }}
              >
                {name} ({collections[name].length})
              </button>
            ))}
            <button
              className="btn btn-secondary"
              onClick={handleDeleteAll}
              style={{ fontSize: '0.8rem', background: '#3a1f1f', color: '#ff8a8a' }}
            >
              Delete All
            </button>
          </div>
        </div>
      )}

      <div className="search-container">
        <div className="search-input-wrapper">
          <input
            type="text"
            className="search-input"
            placeholder="Filter by name or set..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.6rem',
        flexWrap: 'wrap', marginBottom: '1.5rem'
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.62rem',
          letterSpacing: '0.22em',
          color: 'var(--fg-3)',
          textTransform: 'uppercase'
        }}>Sort by</span>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          style={{
            padding: '0.42rem 1.8rem 0.42rem 0.7rem',
            background: 'var(--bg-2)',
            border: '1px solid var(--rule-strong)',
            color: 'var(--fg-0)',
            borderRadius: '3px',
            fontFamily: 'var(--font-body)',
            fontSize: '0.82rem',
            cursor: 'pointer',
            outline: 'none',
            appearance: 'none',
            WebkitAppearance: 'none',
            backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\' viewBox=\'0 0 10 6\'><path fill=\'none\' stroke=\'%239aa\' stroke-width=\'1.4\' d=\'M1 1l4 4 4-4\'/></svg>")',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 0.6rem center',
            transition: 'border-color 160ms'
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--rule-strong)' }}
        >
          <option value="dateNewest">Date Added: Newest First</option>
          <option value="dateOldest">Date Added: Oldest First</option>
          <option value="priceAsc">Price: Low to High</option>
          <option value="priceDesc">Price: High to Low</option>
          <option value="priceChangeAsc">Price Change: Low to High</option>
          <option value="priceChangeDesc">Price Change: High to Low</option>
          <option value="pctAsc">Percent Change: Low to High</option>
          <option value="pctDesc">Percent Change: High to Low</option>
          <option value="cardNumAsc">Card Number: Low to High</option>
          <option value="cardNumDesc">Card Number: High to Low</option>
          <option value="nameAsc">Product Name: A to Z</option>
          <option value="nameDesc">Product Name: Z to A</option>
        </select>
      </div>

      {allCards.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>
          <p>No cards in your collection yet.</p>
          <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
            {savedToken
              ? 'Click "Refresh" to pull from Collectr.'
              : 'Click "Set Token" to connect your Collectr account.'}
          </p>
        </div>
      ) : (
        <div className="cards-grid">
          {filteredCards.map(card => {
            const g = gradeFromCard(card)
            const isGraded = g.isGraded
            const gradeLabel = isGraded ? `${g.company} ${g.grade}` : ''
            const pid = card.product_id
            const hasPid = pid != null && String(pid).length > 0 && String(pid) !== 'null'
            const Wrapper = hasPid ? Link : 'div'
            const wrapperProps = hasPid
              ? { to: `/card/${pid}` }
              : {}
            return (
            <Wrapper
              key={card.id}
              {...wrapperProps}
              className="pokemon-card"
              style={{ position: 'relative', textDecoration: 'none', color: 'inherit', cursor: hasPid ? 'pointer' : 'default' }}
            >
              {isGraded && (
                <div style={{
                  background: 'linear-gradient(180deg, #2a2a3e 0%, #1a1a2a 100%)',
                  border: '1px solid var(--rule-strong)',
                  borderRadius: '4px 4px 0 0',
                  padding: '0.45rem 0.6rem',
                  textAlign: 'center',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.7rem',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--accent-strong, #c9b6ff)',
                  borderBottom: 'none'
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
                <div style={{
                  width: '100%',
                  borderRadius: '6%',
                  overflow: 'hidden',
                  background: 'var(--bg-1)',
                  display: 'block'
                }}>
                  {card.image_url ? (
                    <img
                      src={card.image_url}
                      alt={card.product_name}
                      style={{
                        width: '100%',
                        display: 'block',
                        margin: 0,
                        // Clip 4% off each side of the image so the white card
                        // border is cropped away. The wrapper's dark bg shows
                        // in the clipped area, reading as a black inset border.
                        clipPath: 'inset(4.5% round 4%)'
                      }}
                    />
                  ) : (
                    <div style={{
                      width: '100%',
                      aspectRatio: '2.5/3.5',
                      background: 'linear-gradient(135deg, #1a1a2e 0%, #2d2d44 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#666',
                      fontSize: '0.8rem',
                      textAlign: 'center',
                      padding: '1rem'
                    }}>
                      No Image
                    </div>
                  )}
                </div>
              </div>
              <div className="pokemon-card-info">
                <div className="pokemon-card-name">{card.product_name}</div>
                <div className="pokemon-card-set">{card.catalog_group}</div>
                <div style={{ fontSize: '0.85rem', color: '#888' }}>
                  #{card.card_number}
                </div>
                <div className="pokemon-card-price" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  {(() => {
                    const diffUsd = parseFloat(card.market_price_diff) || 0
                    if (diffUsd === 0) return null
                    const arrow = diffUsd > 0 ? '▲' : '▼'
                    const color = diffUsd > 0 ? 'var(--mint, #86e1c0)' : 'var(--danger, #ff8a8a)'
                    return <span style={{ color, fontSize: '0.85rem' }}>{arrow}</span>
                  })()}
                  <span>A${((parseFloat(card.market_price) || 0) * exchangeRate).toFixed(2)}</span>
                </div>
                {(() => {
                  const diffUsd = parseFloat(card.market_price_diff) || 0
                  const pct = parseFloat(card.market_price_percentage_diff) || 0
                  if (diffUsd === 0 && pct === 0) return null
                  const isUp = diffUsd > 0
                  const color = isUp ? 'var(--mint, #86e1c0)' : 'var(--danger, #ff8a8a)'
                  const sign = isUp ? '+' : '-'
                  const diffAud = Math.abs(diffUsd) * exchangeRate
                  return (
                    <div style={{ fontSize: '0.78rem', color, marginTop: '0.15rem' }}>
                      {sign}A${diffAud.toFixed(2)} ({sign}{Math.abs(pct).toFixed(2)}%)
                    </div>
                  )
                })()}
                <div style={{ fontSize: '0.8rem', color: '#888' }}>
                  {card.card_condition} | {card.rarity}
                </div>
                {card.variance && (
                  <div style={{ fontSize: '0.75rem', color: '#666' }}>
                    {card.variance}
                  </div>
                )}
                {parseInt(card.quantity) > 1 && (
                  <div style={{ fontSize: '0.75rem', color: '#4dabf7' }}>
                    Qty: {card.quantity}
                  </div>
                )}
              </div>
            </Wrapper>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default Collection
