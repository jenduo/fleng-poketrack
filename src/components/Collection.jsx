import { useState, useEffect } from 'react'
import { db, functions } from '../firebase'
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'

function Collection() {
  const [filter, setFilter] = useState('')
  const [collections, setCollections] = useState({})
  const [imageCache, setImageCache] = useState({})
  const [selectedCollection, setSelectedCollection] = useState('Main')
  const [loading, setLoading] = useState(true)
  const [showImportCSV, setShowImportCSV] = useState(false)
  const [showImportImages, setShowImportImages] = useState(false)
  const [jsonInput, setJsonInput] = useState('')
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState('')
  const [exchangeRate, setExchangeRate] = useState(1.55)
  const [showAutoImport, setShowAutoImport] = useState(false)
  const [profileUrl, setProfileUrl] = useState('')
  const [autoImportProgress, setAutoImportProgress] = useState('')

  useEffect(() => {
    loadData()
    fetchExchangeRate()
  }, [])

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
    } catch (error) {
      console.error('Error loading data:', error)
    }
    setLoading(false)
  }

  const fetchExchangeRate = async () => {
    try {
      const response = await fetch('https://api.frankfurter.app/latest?from=USD&to=AUD')
      const data = await response.json()
      setExchangeRate(data.rates.AUD)
    } catch (error) {
      console.error('Error fetching exchange rate:', error)
    }
  }

  const getImageKey = (productName, catalogGroup) => {
    return `${productName?.trim().toLowerCase()}|${catalogGroup?.trim().toLowerCase()}`
  }

  const parseCSV = (csvText) => {
    const lines = csvText.split('\n')
    const headers = lines[0].split(',').map(h => h.trim())

    const cards = []
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (!line.trim()) continue

      const values = []
      let current = ''
      let inQuotes = false

      for (let j = 0; j < line.length; j++) {
        const char = line[j]
        if (char === '"') {
          inQuotes = !inQuotes
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      values.push(current.trim())

      const card = {}
      headers.forEach((header, index) => {
        card[header] = values[index] || ''
      })

      if (card['Watchlist'] === 'true' && !card['Portfolio Name']) {
        continue
      }

      cards.push(card)
    }

    return cards
  }

  const handleCSVUpload = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    setImportError('')
    setImportSuccess('')

    try {
      const text = await file.text()
      const cards = parseCSV(text)

      if (cards.length === 0) {
        throw new Error('No valid cards found in CSV')
      }

      // Load fresh image cache
      let currentImageCache = { ...imageCache }
      try {
        const imageCacheRef = doc(db, 'collectr_imports', 'image_cache')
        const imageCacheSnap = await getDoc(imageCacheRef)
        if (imageCacheSnap.exists()) {
          currentImageCache = imageCacheSnap.data().images || {}
        }
      } catch (e) {
        console.error('Error loading image cache:', e)
      }

      const grouped = {}
      let imagesFound = 0

      cards.forEach(card => {
        const portfolioName = card['Portfolio Name'] || 'Main'
        if (!grouped[portfolioName]) {
          grouped[portfolioName] = []
        }

        const marketPriceKey = Object.keys(card).find(k => k.startsWith('Market Price'))
        const marketPrice = card[marketPriceKey] || '0'

        // Check image cache for existing image
        const imageKey = getImageKey(card['Product Name'], card['Set'])
        const cachedImage = currentImageCache[imageKey] || null
        if (cachedImage) imagesFound++

        grouped[portfolioName].push({
          portfolio_name: portfolioName,
          category: card['Category'] || 'Pokemon',
          catalog_group: card['Set'] || '',
          product_name: card['Product Name'] || '',
          card_number: card['Card Number'] || '',
          rarity: card['Rarity'] || '',
          variance: card['Variance'] || '',
          grade: card['Grade'] || '',
          card_condition: card['Card Condition'] || '',
          cost_paid: card['Average Cost Paid'] || '0',
          quantity: card['Quantity'] || '1',
          market_price: marketPrice,
          price_override: card['Price Override'] || '0',
          watchlist: card['Watchlist'] === 'true',
          date_added: card['Date Added'] || '',
          notes: card['Notes'] || '',
          image_url: cachedImage,
          id: `${card['Set']}-${card['Product Name']}-${card['Card Number']}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        })
      })

      await setDoc(doc(db, 'collectr_imports', 'main'), { collections: grouped })
      setCollections(grouped)
      setShowImportCSV(false)
      setImportSuccess(`Imported ${cards.length} cards! (${imagesFound} images found in cache)`)

      event.target.value = ''
    } catch (error) {
      setImportError(error.message)
    }
  }

  const handleAutoImport = async () => {
    setImportError('')
    setImportSuccess('')
    setAutoImportProgress('Extracting profile ID...')

    try {
      // Extract profile ID from URL
      const urlMatch = profileUrl.match(/profile\/([a-f0-9-]+)/i)
      if (!urlMatch) {
        throw new Error('Invalid Collectr URL. Please paste the full profile URL.')
      }
      const profileId = urlMatch[1]

      setAutoImportProgress('Fetching from Collectr API...')

      // Call Cloud Function to fetch data
      const getCollectrProfile = httpsCallable(functions, 'getCollectrProfile')

      // Fetch all cards (may need multiple calls for large collections)
      let allProducts = []
      let offset = 0
      const limit = 100
      let totalCards = null

      while (true) {
        setAutoImportProgress(`Fetching cards ${offset + 1}-${offset + limit}...`)

        const result = await getCollectrProfile({ profileId, offset, limit })
        const data = result.data

        if (totalCards === null) {
          totalCards = parseInt(data.total_cards) || 0
        }

        if (data.products && data.products.length > 0) {
          allProducts = [...allProducts, ...data.products]
        }

        // Check if we have all cards
        if (allProducts.length >= totalCards || !data.products || data.products.length < limit) {
          break
        }

        offset += limit
      }

      setAutoImportProgress(`Processing ${allProducts.length} cards...`)

      // Save images to cache
      const newImages = {}
      allProducts.forEach(product => {
        if (product.image_url) {
          const key = getImageKey(product.product_name, product.catalog_group)
          newImages[key] = product.image_url
        }
      })

      const updatedImageCache = { ...imageCache, ...newImages }
      await setDoc(doc(db, 'collectr_imports', 'image_cache'), { images: updatedImageCache })
      setImageCache(updatedImageCache)

      // Group cards into Main collection
      const grouped = {
        Main: allProducts.map(product => ({
          portfolio_name: 'Main',
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
        }))
      }

      await setDoc(doc(db, 'collectr_imports', 'main'), { collections: grouped })
      setCollections(grouped)
      setShowAutoImport(false)
      setProfileUrl('')
      setAutoImportProgress('')
      setImportSuccess(`Imported ${allProducts.length} cards with images!`)
    } catch (error) {
      console.error('Auto import error:', error)
      setImportError(error.message || 'Failed to fetch from Collectr')
      setAutoImportProgress('')
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
        card.catalog_group.toLowerCase().includes(filter.toLowerCase())
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
        <h1>Frank's Collection</h1>
        <p>
          {allCards.length} cards ({cardsWithImages} with images) |
          Portfolio: A${totalValueAUD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        <p style={{ fontSize: '0.8rem', color: '#888' }}>
          Live rate: 1 USD = {exchangeRate.toFixed(4)} AUD | Image cache: {cachedImagesCount} images
        </p>

        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={() => { setShowImportCSV(!showImportCSV); setShowImportImages(false); setShowAutoImport(false); setImportError(''); setImportSuccess(''); }}
          >
            {showImportCSV ? 'Cancel' : 'Import CSV'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => { setShowImportImages(!showImportImages); setShowImportCSV(false); setShowAutoImport(false); setImportError(''); setImportSuccess(''); }}
          >
            {showImportImages ? 'Cancel' : 'Import Images'}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => { setShowAutoImport(!showAutoImport); setShowImportCSV(false); setShowImportImages(false); setImportError(''); setImportSuccess(''); }}
          >
            {showAutoImport ? 'Cancel' : 'Auto Import'}
          </button>
        </div>

        {importSuccess && (
          <p style={{ color: '#4ade80', marginTop: '0.5rem' }}>{importSuccess}</p>
        )}
      </div>

      {showAutoImport && (
        <div style={{
          background: '#1a1a2e',
          padding: '1.5rem',
          borderRadius: '8px',
          marginBottom: '2rem'
        }}>
          <h3 style={{ marginBottom: '1rem' }}>Auto Import from Collectr</h3>
          <p style={{ marginBottom: '1rem', color: '#888', fontSize: '0.9rem' }}>
            Paste your Collectr profile URL and we'll fetch all your cards automatically.
          </p>
          <input
            type="text"
            value={profileUrl}
            onChange={(e) => setProfileUrl(e.target.value)}
            placeholder="https://app.getcollectr.com/showcase/profile/..."
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '4px',
              border: '1px solid #333',
              background: '#0d0d1a',
              color: '#fff',
              fontSize: '0.9rem',
              marginBottom: '1rem',
              boxSizing: 'border-box'
            }}
          />
          {autoImportProgress && (
            <p style={{ color: '#4dabf7', marginBottom: '0.5rem' }}>{autoImportProgress}</p>
          )}
          {importError && (
            <p style={{ color: '#ff6b6b', marginBottom: '0.5rem' }}>{importError}</p>
          )}
          <button
            className="btn btn-primary"
            onClick={handleAutoImport}
            disabled={!profileUrl.trim() || !!autoImportProgress}
          >
            {autoImportProgress ? 'Importing...' : 'Import'}
          </button>
        </div>
      )}

      {showImportCSV && (
        <div style={{
          background: '#1a1a2e',
          padding: '1.5rem',
          borderRadius: '8px',
          marginBottom: '2rem'
        }}>
          <h3 style={{ marginBottom: '1rem' }}>Import CSV</h3>
          <p style={{ marginBottom: '1rem', color: '#888', fontSize: '0.9rem' }}>
            Export your collection from Collectr as CSV and upload it here.<br/>
            Cards will be organized by Portfolio Name. Cached images will be applied automatically.
          </p>
          <input
            type="file"
            accept=".csv"
            onChange={handleCSVUpload}
            style={{
              padding: '0.5rem',
              background: '#0d0d1a',
              border: '1px solid #333',
              borderRadius: '4px',
              color: '#fff'
            }}
          />
          {importError && (
            <p style={{ color: '#ff6b6b', marginTop: '0.5rem' }}>{importError}</p>
          )}
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
            Click "Import CSV" to upload your Collectr export.
          </p>
        </div>
      ) : (
        <div className="cards-grid">
          {filteredCards.map(card => (
            <div key={card.id} className="pokemon-card">
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
                  A${(parseFloat(card.market_price) * exchangeRate).toFixed(2)}
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
