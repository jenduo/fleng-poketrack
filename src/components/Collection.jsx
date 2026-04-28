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
  const [authToken, setAuthToken] = useState('')
  const [autoImportProgress, setAutoImportProgress] = useState('')
  const [terminalJsonInput, setTerminalJsonInput] = useState('')
  const [showTokenHelp, setShowTokenHelp] = useState(false)
  const [importMethod, setImportMethod] = useState('direct')
  const [osTab, setOsTab] = useState(() => {
    if (typeof navigator === 'undefined') return 'mac'
    const p = (navigator.platform || '') + ' ' + (navigator.userAgent || '')
    if (/Win/i.test(p)) return 'win'
    if (/Linux|Android/i.test(p)) return 'linux'
    return 'mac'
  })

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

  const [csvImporting, setCsvImporting] = useState(false)

  const handleCSVUpload = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    setImportError('')
    setImportSuccess('')
    setCsvImporting(true)

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
      console.error('CSV Import error:', error)
      setImportError(error.message || 'Unknown error')
    } finally {
      setCsvImporting(false)
    }
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

  const handleImportFromTerminalJson = async () => {
    setImportError('')
    setImportSuccess('')
    try {
      const parsed = JSON.parse(terminalJsonInput)
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON')
      // Expected shape: { "<collection name>": [products] }
      const grouped = {}
      let totalCount = 0
      for (const [name, products] of Object.entries(parsed)) {
        if (!Array.isArray(products)) continue
        grouped[name] = products.map(p => productToCard(p, name))
        totalCount += products.length
      }
      if (totalCount === 0) throw new Error('No products found in pasted JSON')
      await writeImportedCollections(grouped)
      setTerminalJsonInput('')
      setShowAutoImport(false)
      setAuthToken('')
      setImportSuccess(`Imported ${totalCount} cards across ${Object.keys(grouped).length} collection(s)!`)
    } catch (e) {
      setImportError(`Could not import: ${e.message}`)
    }
  }

  const handleAutoImport = async () => {
    setImportError('')
    setImportSuccess('')
    setAutoImportProgress('Extracting profile ID...')

    try {
      const tokenTrimmed = authToken.trim() || null

      const getCollectrProfile = httpsCallable(functions, 'getCollectrProfile')

      let grouped = {}
      let totalCount = 0

      if (tokenTrimmed) {
        // Owner mode: hit Collectr directly from the browser. The Cloud Function
        // is blocked by AWS WAF when running from Google Cloud egress IPs, but
        // Collectr's API allows CORS (* origin) so a browser fetch works.
        const ownerUuid = (() => {
          try {
            const payload = JSON.parse(atob(tokenTrimmed.split('.')[1]))
            return payload.username
          } catch { return null }
        })()
        if (!ownerUuid) throw new Error('Could not decode UUID from token.')

        const apiHeaders = {
          accept: 'application/json, text/plain, */*',
          authorization: tokenTrimmed
        }
        const apiGet = async (url) => {
          const r = await fetch(url, { headers: apiHeaders })
          if (!r.ok) throw new Error(`Collectr ${r.status}: ${(await r.text()).slice(0, 200)}`)
          return r.json()
        }

        setAutoImportProgress('Listing collections...')
        const colsResp = await apiGet(`https://api-v2.getcollectr.com/accounts/${ownerUuid}/collections`)
        const cols = colsResp.data || []

        for (const c of cols) {
          let off = 0
          const pageSize = 200
          const items = []
          while (true) {
            setAutoImportProgress(`Fetching "${c.name}" (${items.length}+)...`)
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
      } else {
        // Anonymous showcase mode (capped at ~30)
        const uuidMatch = profileUrl.match(/profile\/([a-f0-9-]{36})/i)
        const handleMatch = profileUrl.match(/profile\/@?([a-zA-Z0-9_-]+)/i)
        const profileId = (uuidMatch && uuidMatch[1]) || (handleMatch && handleMatch[1])
        if (!profileId) throw new Error('Invalid Collectr URL.')

        let allProducts = []
        let offset = 0
        const limit = 100
        let totalCards = null
        while (true) {
          setAutoImportProgress(`Fetching cards ${offset + 1}-${offset + limit}...`)
          const result = await getCollectrProfile({ profileId, offset, limit })
          const data = result.data
          if (totalCards === null) totalCards = parseInt(data.total_cards) || 0
          if (data.products && data.products.length > 0) allProducts = [...allProducts, ...data.products]
          if (allProducts.length >= totalCards || !data.products || data.products.length < limit) break
          offset += limit
        }
        grouped = { Main: allProducts.map(p => productToCard(p, 'Main')) }
        totalCount = allProducts.length
      }

      setAutoImportProgress(`Processing ${totalCount} cards...`)
      await writeImportedCollections(grouped)
      setShowAutoImport(false)
      setProfileUrl('')
      setAuthToken('')
      setAutoImportProgress('')
      setImportSuccess(`Imported ${totalCount} cards across ${Object.keys(grouped).length} collection(s)!`)
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
          <p style={{ color: '#86e1c0', marginTop: '0.5rem' }}>{importSuccess}</p>
        )}
      </div>

      {showAutoImport && (() => {
        const mono = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'
        const sectionRow = (n, title) => (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.7rem',
            marginTop: '1.5rem', marginBottom: '0.9rem'
          }}>
            <span style={{
              fontFamily: mono, fontSize: '0.72rem', letterSpacing: '0.2em',
              color: '#9b7eff', fontWeight: 600
            }}>{n}</span>
            <span style={{
              fontFamily: mono, fontSize: '0.72rem', letterSpacing: '0.22em',
              color: '#cfcfe0', textTransform: 'uppercase'
            }}>{title}</span>
            <span style={{ flex: 1, height: 1, background: '#2a2a3e' }} />
          </div>
        )
        const fieldLabel = {
          display: 'block', marginBottom: '0.4rem',
          fontSize: '0.7rem', letterSpacing: '0.1em',
          textTransform: 'uppercase', color: '#9a9ab0', fontFamily: mono
        }
        const inputBase = {
          width: '100%', padding: '0.7rem 0.85rem',
          borderRadius: '4px', border: '1px solid #2a2a3e',
          background: '#0d0d1a', color: '#fff',
          fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none'
        }
        const inlineCode = {
          background: '#0d0d1a', padding: '0.05rem 0.4rem',
          borderRadius: '3px', fontFamily: mono,
          fontSize: '0.78em', color: '#9cdcfe'
        }
        const hasToken = !!authToken.trim()
        const effectiveMethod = hasToken ? importMethod : 'direct'

        const safeTokenSh = authToken.trim().replace(/'/g, "'\\''")
        const jsBody = `const t=process.env.TOKEN;const u=JSON.parse(Buffer.from(t.split('.')[1],'base64')).username;const h={authorization:t,accept:'application/json, text/plain, */*',origin:'https://app.getcollectr.com',referer:'https://app.getcollectr.com/','user-agent':'Mozilla/5.0'};const g=async u=>{const r=await fetch(u,{headers:h});if(r.ok===false)throw new Error(r.status+': '+await r.text());return r.json()};(async()=>{const cs=(await g('https://api-v2.getcollectr.com/accounts/'+u+'/collections')).data;const o={};for(const c of cs){const it=[];let off=0;while(true){const cid=c.id===u?'':'&collectionId='+c.id;const j=await g('https://api-v2.getcollectr.com/collections/'+u+'/products?limit=200&offset='+off+'&unstackedView=true'+cid);const b=j.data||[];it.push(...b);if(b.length<200)break;off+=b.length}o[c.name]=it}console.log(JSON.stringify(o))})().catch(e=>{console.error(e.message);process.exit(1)})`
        const psJsBody = jsBody.replace(/"/g, '`"')
        const cmds = {
          mac:   `TOKEN='${safeTokenSh}' node -e "${jsBody}" | pbcopy && echo "Copied to clipboard — paste into the app."`,
          linux: `TOKEN='${safeTokenSh}' node -e "${jsBody}" | (xclip -selection clipboard 2>/dev/null || xsel -b -i) && echo "Copied to clipboard — paste into the app."`,
          win:   `$env:TOKEN='${authToken.trim().replace(/'/g, "''")}'; node -e "${psJsBody}" | Set-Clipboard; Write-Host "Copied to clipboard — paste into the app."`
        }
        const osChips = [
          { key: 'mac',   label: 'macOS' },
          { key: 'linux', label: 'Linux' },
          { key: 'win',   label: 'Windows' }
        ]

        return (
          <div style={{
            background: '#1a1a2e', padding: '1.5rem 1.5rem 1.75rem',
            borderRadius: '8px', marginBottom: '2rem',
            border: '1px solid #232336'
          }}>
            {/* === Header === */}
            <div style={{
              display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
              gap: '1rem', flexWrap: 'wrap'
            }}>
              <div>
                <div style={{
                  fontFamily: mono, fontSize: '0.7rem', letterSpacing: '0.22em',
                  color: '#9b7eff', marginBottom: '0.4rem', textTransform: 'uppercase'
                }}>// Collectr Importer</div>
                <h3 style={{ margin: 0, fontSize: '1.4rem', letterSpacing: '-0.01em', fontWeight: 600 }}>
                  Auto Import
                </h3>
              </div>
              <div style={{
                fontSize: '0.78rem', color: '#777', maxWidth: '320px',
                textAlign: 'right', lineHeight: 1.5
              }}>
                Token unlocks your full account. URL alone gives the public showcase (~30 cards).
              </div>
            </div>

            {/* === 01 AUTHENTICATE === */}
            {sectionRow('01', 'Authenticate')}

            <label style={fieldLabel}>
              Profile URL <span style={{ color: '#666', textTransform: 'none', letterSpacing: 0 }}>· optional, public showcase only</span>
            </label>
            <input
              type="text"
              value={profileUrl}
              onChange={(e) => setProfileUrl(e.target.value)}
              placeholder="https://app.getcollectr.com/showcase/profile/@handle"
              style={{ ...inputBase, marginBottom: '0.85rem' }}
            />

            <label style={fieldLabel}>
              Auth Token <span style={{ color: '#666', textTransform: 'none', letterSpacing: 0 }}>· unlocks full collection</span>
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="password"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                placeholder="eyJhbGciOi..."
                style={{ ...inputBase, flex: 1, fontFamily: mono, fontSize: '0.82rem' }}
              />
              <button
                onClick={() => setShowTokenHelp(s => !s)}
                style={{
                  padding: '0 0.95rem', background: showTokenHelp ? '#222244' : '#0d0d1a',
                  border: '1px solid #2a2a3e', color: '#bbb', borderRadius: '4px',
                  cursor: 'pointer', fontSize: '0.74rem', fontFamily: mono,
                  letterSpacing: '0.08em', whiteSpace: 'nowrap', textTransform: 'uppercase'
                }}
              >
                {showTokenHelp ? 'Hide' : 'How?'}
              </button>
            </div>

            {showTokenHelp && (
              <div style={{
                marginTop: '0.75rem', background: '#0d0d1a',
                border: '1px solid #2a2a3e', borderRadius: '4px',
                padding: '0.85rem 1rem', fontSize: '0.85rem'
              }}>
                <ol style={{ margin: 0, paddingLeft: '1.2rem', color: '#aaa', lineHeight: 1.7 }}>
                  <li>Open <a href="https://app.getcollectr.com" target="_blank" rel="noreferrer" style={{ color: '#9b7eff' }}>app.getcollectr.com</a> and log in.</li>
                  <li>DevTools (F12 / ⌥⌘I) → <strong style={{ color: '#ddd' }}>Network</strong> tab.</li>
                  <li>Refresh, click any request to <code style={inlineCode}>api-v2.getcollectr.com</code>.</li>
                  <li>Find the <code style={inlineCode}>authorization</code> request header.</li>
                  <li>Copy its full value (no <code style={inlineCode}>Bearer</code> prefix) and paste above.</li>
                </ol>
                <pre style={{
                  marginTop: '0.65rem', marginBottom: 0, background: '#000',
                  padding: '0.6rem 0.75rem', color: '#9cdcfe', fontFamily: mono,
                  fontSize: '0.7rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                  borderRadius: '3px'
                }}>{`authorization: eyJhbGciOiJIUzI1NiJ9.eyJ1c2Vy…P-7rD-rt7FFRISFdUpzz`}</pre>
              </div>
            )}

            {/* === 02 IMPORT METHOD === */}
            {(hasToken || profileUrl.trim()) && (
              <>
                {sectionRow('02', 'Import Method')}

                <div style={{
                  display: 'flex', borderBottom: '1px solid #2a2a3e',
                  marginBottom: '1.1rem'
                }}>
                  {[
                    { key: 'direct',   label: 'Direct fetch', show: true },
                    { key: 'terminal', label: 'Terminal',     show: hasToken }
                  ].filter(t => t.show).map(t => {
                    const active = effectiveMethod === t.key
                    return (
                      <button
                        key={t.key}
                        onClick={() => setImportMethod(t.key)}
                        style={{
                          background: 'transparent', border: 'none',
                          padding: '0.6rem 1.1rem', cursor: 'pointer',
                          color: active ? '#fff' : '#666', fontSize: '0.78rem',
                          fontFamily: mono, letterSpacing: '0.08em', textTransform: 'uppercase',
                          borderBottom: active ? '2px solid #9b7eff' : '2px solid transparent',
                          marginBottom: '-1px', transition: 'color 120ms'
                        }}
                      >
                        {t.label}
                      </button>
                    )
                  })}
                </div>

                {effectiveMethod === 'direct' && (
                  <div>
                    <p style={{ color: '#888', fontSize: '0.82rem', margin: '0 0 0.9rem', lineHeight: 1.55 }}>
                      Calls Collectr directly from your browser — fastest path. May fail on networks
                      that block cross-origin calls; switch to <strong style={{ color: '#bbb' }}>Terminal</strong> if it does.
                    </p>
                    {autoImportProgress && (
                      <p style={{ color: '#4dabf7', margin: '0 0 0.6rem', fontSize: '0.85rem' }}>{autoImportProgress}</p>
                    )}
                    {importError && (
                      <p style={{ color: '#ff6b6b', margin: '0 0 0.6rem', fontSize: '0.85rem' }}>{importError}</p>
                    )}
                    <button
                      className="btn btn-primary"
                      onClick={handleAutoImport}
                      disabled={(!profileUrl.trim() && !authToken.trim()) || !!autoImportProgress}
                    >
                      {autoImportProgress ? 'Importing…' : (hasToken ? 'Import All Collections →' : 'Import Showcase →')}
                    </button>
                  </div>
                )}

                {effectiveMethod === 'terminal' && hasToken && (
                  <div>
                    <p style={{ color: '#888', fontSize: '0.82rem', margin: '0 0 0.9rem', lineHeight: 1.55 }}>
                      Run this on your machine (requires <code style={inlineCode}>node</code> 18+).
                      The JSON pipes to your clipboard automatically.
                    </p>

                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.7rem'
                    }}>
                      <span style={{
                        fontSize: '0.7rem', color: '#666', fontFamily: mono,
                        letterSpacing: '0.16em', marginRight: '0.3rem', textTransform: 'uppercase'
                      }}>OS</span>
                      {osChips.map(c => {
                        const active = osTab === c.key
                        return (
                          <button
                            key={c.key}
                            onClick={() => setOsTab(c.key)}
                            style={{
                              padding: '0.3rem 0.75rem',
                              background: active ? 'rgba(155,126,255,0.13)' : 'transparent',
                              border: active ? '1px solid #9b7eff' : '1px solid #2a2a3e',
                              color: active ? '#fff' : '#888',
                              borderRadius: '3px', cursor: 'pointer',
                              fontSize: '0.74rem', fontFamily: mono,
                              transition: 'all 120ms'
                            }}
                          >
                            {c.label}
                          </button>
                        )
                      })}
                    </div>

                    <div style={{ position: 'relative', marginBottom: '0.95rem' }}>
                      <pre style={{
                        background: '#000', padding: '0.85rem 0.95rem 0.85rem 0.95rem',
                        paddingRight: '4.2rem', borderRadius: '3px',
                        border: '1px solid #1c1c2c', overflowX: 'auto',
                        color: '#9cdcfe', fontFamily: mono, fontSize: '0.7rem',
                        margin: 0, maxHeight: '140px',
                        whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.55
                      }}>{cmds[osTab]}</pre>
                      <button
                        onClick={() => navigator.clipboard.writeText(cmds[osTab])}
                        style={{
                          position: 'absolute', top: '8px', right: '8px',
                          background: '#1a1a2e', border: '1px solid #333',
                          color: '#bbb', padding: '0.3rem 0.7rem', borderRadius: '3px',
                          cursor: 'pointer', fontSize: '0.7rem', fontFamily: mono,
                          letterSpacing: '0.08em', textTransform: 'uppercase'
                        }}
                      >
                        Copy
                      </button>
                    </div>

                    <label style={fieldLabel}>JSON Output</label>
                    <textarea
                      value={terminalJsonInput}
                      onChange={(e) => setTerminalJsonInput(e.target.value)}
                      placeholder="Paste the clipboard contents here"
                      style={{
                        width: '100%', height: '100px', padding: '0.75rem',
                        borderRadius: '4px', border: '1px solid #2a2a3e',
                        background: '#0d0d1a', color: '#fff', fontFamily: mono,
                        fontSize: '0.78rem', boxSizing: 'border-box',
                        marginBottom: '0.6rem', resize: 'vertical', lineHeight: 1.5,
                        outline: 'none'
                      }}
                    />
                    {importError && (
                      <p style={{ color: '#ff6b6b', margin: '0 0 0.6rem', fontSize: '0.85rem' }}>{importError}</p>
                    )}
                    <button
                      className="btn btn-primary"
                      onClick={handleImportFromTerminalJson}
                      disabled={!terminalJsonInput.trim()}
                    >
                      Import from clipboard →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )
      })()}

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
            disabled={csvImporting}
            style={{
              padding: '0.5rem',
              background: '#0d0d1a',
              border: '1px solid #333',
              borderRadius: '4px',
              color: '#fff'
            }}
          />
          {csvImporting && (
            <p style={{ color: '#4dabf7', marginTop: '0.5rem' }}>Importing CSV...</p>
          )}
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
            Click "Import CSV" to upload your Collectr export.
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
