import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore'

function Collection() {
  const [filter, setFilter] = useState('')
  const [collections, setCollections] = useState({})
  const [imageCache, setImageCache] = useState({})
  const [selectedCollection, setSelectedCollection] = useState('Main')
  const [loading, setLoading] = useState(true)
  const [showImportImages, setShowImportImages] = useState(false)
  const [jsonInput, setJsonInput] = useState('')
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
      // Load collections
      const collectionsRef = doc(db, 'collectr_imports', 'main')
      const collectionsSnap = await getDoc(collectionsRef)
      if (collectionsSnap.exists()) {
        const loadedCollections = collectionsSnap.data().collections || {}
        setCollections(loadedCollections)

        // Auto-select Main if exists, otherwise first collection
        const names = Object.keys(loadedCollections)
        if (names.length > 0 && !loadedCollections['Main']) {
          setSelectedCollection(names[0])
        }
      }

      // Load image cache
      const imageCacheRef = doc(db, 'collectr_imports', 'image_cache')
      const imageCacheSnap = await getDoc(imageCacheRef)
      if (imageCacheSnap.exists()) {
        setImageCache(imageCacheSnap.data().images || {})
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

  const getImageKey = (productName, catalogGroup) => {
    return `${productName?.trim().toLowerCase()}|${catalogGroup?.trim().toLowerCase()}`
  }

  const productToCard = (product, portfolioName) => ({
    portfolio_name: portfolioName,
    category: product.catalog_category_name || 'Pokemon',
    catalog_group: product.catalog_group || '',
    product_name: product.product_name || '',
    card_number: product.card_number || '',
    rarity: product.rarity || '',
    variance: product.product_sub_type || '',
    grade: product.grade_company || '',
    card_condition: product.card_condition || '',
    cost_paid: '0',
    quantity: product.quantity || '1',
    market_price: product.market_price || '0',
    price_override: '0',
    watchlist: false,
    date_added: '',
    notes: '',
    image_url: product.image_url || null,
    id: `${product.catalog_group}-${product.product_name}-${product.card_number}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  })

  const writeImportedCollections = async (grouped) => {
    const newImages = {}
    Object.values(grouped).flat().forEach(card => {
      if (card.image_url) {
        const key = getImageKey(card.product_name, card.catalog_group)
        newImages[key] = card.image_url
      }
    })
    const updatedImageCache = { ...imageCache, ...newImages }
    await setDoc(doc(db, 'collectr_imports', 'image_cache'), { images: updatedImageCache })
    setImageCache(updatedImageCache)
    await setDoc(doc(db, 'collectr_imports', 'main'), { collections: grouped })
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
      const colsResp = await apiGet(`https://api-v2.getcollectr.com/accounts/${ownerUuid}/collections`)
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
          const url = `https://api-v2.getcollectr.com/collections/${ownerUuid}/products?limit=${pageSize}&offset=${off}&unstackedView=true${cidParam}`
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

  const handleImportImages = async () => {
    setImportError('')
    setImportSuccess('')

    try {
      const data = JSON.parse(jsonInput)

      if (!data.products || !Array.isArray(data.products)) {
        throw new Error('Invalid JSON format. Make sure it has a "products" array.')
      }

      // Build new image mappings from JSON
      const newImages = {}
      data.products.forEach(product => {
        if (product.image_url) {
          const key = getImageKey(product.product_name, product.catalog_group)
          newImages[key] = product.image_url
        }
      })

      // Merge with existing image cache
      const updatedImageCache = { ...imageCache, ...newImages }

      // Save image cache to Firestore
      await setDoc(doc(db, 'collectr_imports', 'image_cache'), { images: updatedImageCache })
      setImageCache(updatedImageCache)

      // Update existing cards with images
      let matchedCount = 0
      const updatedCollections = {}

      Object.entries(collections).forEach(([collectionName, cards]) => {
        updatedCollections[collectionName] = cards.map(card => {
          const key = getImageKey(card.product_name, card.catalog_group)
          if (updatedImageCache[key] && !card.image_url) {
            matchedCount++
            return { ...card, image_url: updatedImageCache[key] }
          } else if (updatedImageCache[key]) {
            // Update even if already has image (might be newer)
            return { ...card, image_url: updatedImageCache[key] }
          }
          return card
        })
      })

      // Save updated collections if we have any
      if (Object.keys(updatedCollections).length > 0) {
        await setDoc(doc(db, 'collectr_imports', 'main'), { collections: updatedCollections })
        setCollections(updatedCollections)
      }

      setJsonInput('')
      setShowImportImages(false)
      setImportSuccess(`Saved ${Object.keys(newImages).length} images to cache! Updated ${matchedCount} cards.`)
    } catch (error) {
      setImportError(error.message)
    }
  }

  const handleDeleteCollection = async (collectionName) => {
    if (!window.confirm(`Are you sure you want to delete "${collectionName}"?`)) {
      return
    }

    try {
      const newCollections = { ...collections }
      delete newCollections[collectionName]

      if (Object.keys(newCollections).length === 0) {
        await deleteDoc(doc(db, 'collectr_imports', 'main'))
      } else {
        await setDoc(doc(db, 'collectr_imports', 'main'), { collections: newCollections })
      }

      setCollections(newCollections)
      if (selectedCollection === collectionName) {
        const remainingNames = Object.keys(newCollections)
        setSelectedCollection(remainingNames[0] || 'Main')
      }
    } catch (error) {
      console.error('Error deleting collection:', error)
    }
  }

  const handleDeleteAll = async () => {
    if (!window.confirm('Are you sure you want to delete ALL collections? (Images will be preserved)')) {
      return
    }

    try {
      await deleteDoc(doc(db, 'collectr_imports', 'main'))
      setCollections({})
      setSelectedCollection('all')
    } catch (error) {
      console.error('Error deleting all collections:', error)
    }
  }

  const getAllCards = () => {
    return collections[selectedCollection] || []
  }

  const getFilteredCards = () => {
    return getAllCards()
      .filter(card =>
        card.product_name.toLowerCase().includes(filter.toLowerCase()) ||
        card.catalog_group.toLowerCase().includes(filter.toLowerCase()) ||
        card.card_number?.toLowerCase().includes(filter.toLowerCase())
      )
      .sort((a, b) => (parseFloat(b.market_price) || 0) - (parseFloat(a.market_price) || 0))
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
  const cachedImagesCount = Object.keys(imageCache).length

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
          USD/AUD {exchangeRate.toFixed(4)} · cache {cachedImagesCount} images
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
            onClick={() => { setShowTokenPanel(!showTokenPanel); setShowImportImages(false); setImportError(''); setImportSuccess(''); }}
          >
            {showTokenPanel ? 'Cancel' : (savedToken ? 'Update Token' : 'Set Token')}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => { setShowImportImages(!showImportImages); setShowTokenPanel(false); setImportError(''); setImportSuccess(''); }}
          >
            {showImportImages ? 'Cancel' : 'Import Images'}
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


      {showImportImages && (
        <div style={{
          background: '#1a1a2e',
          padding: '1.5rem',
          borderRadius: '8px',
          marginBottom: '2rem'
        }}>
          <h3 style={{ marginBottom: '1rem' }}>Import Images from JSON</h3>
          <p style={{ marginBottom: '1rem', color: '#888', fontSize: '0.9rem' }}>
            Images are saved separately and persist even if you delete your collection.<br/>
            1. Go to your Collectr profile page<br/>
            2. Open DevTools (F12) → Network tab<br/>
            3. Refresh and find the "showcase" API request<br/>
            4. Copy the JSON response and paste below
          </p>
          <textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder='Paste JSON here... {"user":"...", "products":[...]}'
            style={{
              width: '100%',
              height: '150px',
              padding: '0.75rem',
              borderRadius: '4px',
              border: '1px solid #333',
              background: '#0d0d1a',
              color: '#fff',
              fontFamily: 'monospace',
              fontSize: '0.85rem',
              resize: 'vertical'
            }}
          />
          {importError && (
            <p style={{ color: '#ff6b6b', marginTop: '0.5rem' }}>{importError}</p>
          )}
          <button
            className="btn btn-primary"
            onClick={handleImportImages}
            style={{ marginTop: '1rem' }}
            disabled={!jsonInput.trim()}
          >
            Save Images
          </button>
        </div>
      )}

      {collectionNames.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {collectionNames.map(name => (
              <button
                key={name}
                className={`btn ${selectedCollection === name ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSelectedCollection(name)}
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
          {filteredCards.map(card => (
            <div key={card.id} className="pokemon-card" style={{ position: 'relative' }}>
              {card.image_url ? (
                <img src={card.image_url} alt={card.product_name} />
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
              <div className="pokemon-card-info">
                <div className="pokemon-card-name">{card.product_name}</div>
                <div className="pokemon-card-set">{card.catalog_group}</div>
                <div style={{ fontSize: '0.85rem', color: '#888' }}>
                  #{card.card_number}
                </div>
                <div className="pokemon-card-price">
                  A${((parseFloat(card.market_price) || 0) * exchangeRate).toFixed(2)}
                </div>
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
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Collection
