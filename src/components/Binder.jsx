import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'

const TOTAL_SLOTS = 216
const SLOTS_PER_PAGE = 9
const TOTAL_PAGES = TOTAL_SLOTS / SLOTS_PER_PAGE // 24 pages

function Binder() {
  const [pages, setPages] = useState(() => {
    // Initialize 24 pages with 9 empty slots each
    return Array(TOTAL_PAGES).fill(null).map(() => Array(SLOTS_PER_PAGE).fill(null))
  })
  const [currentSpread, setCurrentSpread] = useState(0) // 0 = cover + first page
  const [collection, setCollection] = useState([])
  const [usedCardIds, setUsedCardIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [draggedCard, setDraggedCard] = useState(null)
  const [showCollection, setShowCollection] = useState(true)
  const [searchFilter, setSearchFilter] = useState('')
  const [saveStatus, setSaveStatus] = useState('')

  useEffect(() => {
    const loadData = async () => {
      try {
        // Load binder
        const binderRef = doc(db, 'binders', 'main')
        const binderSnap = await getDoc(binderRef)
        if (binderSnap.exists()) {
          const data = binderSnap.data()
          if (data.pages) {
            // Convert object back to array
            const pagesArray = Array(TOTAL_PAGES).fill(null).map((_, i) => {
              return data.pages[`page_${i}`] || Array(SLOTS_PER_PAGE).fill(null)
            })
            setPages(pagesArray)
          }
          if (data.usedCardIds) setUsedCardIds(new Set(data.usedCardIds))
        }

        // Load collection (Main collection)
        const collectionRef = doc(db, 'collectr_imports', 'main')
        const collectionSnap = await getDoc(collectionRef)
        if (collectionSnap.exists()) {
          const collections = collectionSnap.data().collections || {}
          setCollection(collections['Main'] || [])
        } else {
          setCollection([])
        }
      } catch (error) {
        console.error('Error loading data:', error)
        setCollection([])
      }
      setLoading(false)
    }
    loadData()
  }, [])

  const saveBinder = async (newPages, newUsedIds) => {
    setPages(newPages)
    setUsedCardIds(newUsedIds)
    setSaveStatus('Saving...')
    try {
      // Convert nested arrays to object (Firestore doesn't support nested arrays)
      const pagesObject = {}
      newPages.forEach((page, pageIndex) => {
        pagesObject[`page_${pageIndex}`] = page.map(card => {
          if (!card) return null
          return {
            id: card.id || null,
            product_name: card.product_name || null,
            image_url: card.image_url || null,
            catalog_group: card.catalog_group || null,
            variant: card.variant || null,
            price: card.price || null
          }
        })
      })

      await setDoc(doc(db, 'binders', 'main'), {
        pages: pagesObject,
        usedCardIds: Array.from(newUsedIds)
      })
      setSaveStatus('Saved!')
      setTimeout(() => setSaveStatus(''), 2000)
    } catch (error) {
      console.error('Error saving binder:', error.message, error.code, error)
      setSaveStatus('Error: ' + (error.message || 'Unknown'))
    }
  }

  const handleDragStart = (card) => {
    setDraggedCard(card)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
  }

  const handleDrop = (pageIndex, slotIndex) => {
    if (!draggedCard) return

    // Don't allow dropping on an occupied slot
    if (pages[pageIndex][slotIndex] !== null) return

    const newPages = pages.map(page => [...page])
    newPages[pageIndex][slotIndex] = draggedCard

    const newUsedIds = new Set(usedCardIds)
    newUsedIds.add(draggedCard.id)

    saveBinder(newPages, newUsedIds)
    setDraggedCard(null)
  }

  const handleRemoveCard = (pageIndex, slotIndex) => {
    const card = pages[pageIndex][slotIndex]
    if (!card) return

    const newPages = pages.map(page => [...page])
    newPages[pageIndex][slotIndex] = null

    const newUsedIds = new Set(usedCardIds)
    newUsedIds.delete(card.id)

    saveBinder(newPages, newUsedIds)
  }

  const availableCards = collection
    .filter(card => !usedCardIds.has(card.id))
    .filter(card =>
      searchFilter === '' ||
      card.product_name?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      card.catalog_group?.toLowerCase().includes(searchFilter.toLowerCase())
    )
  const totalSpreads = Math.ceil(TOTAL_PAGES / 2) + 1 // +1 for cover spread

  const getSpreadPages = () => {
    if (currentSpread === 0) {
      // Cover on left, first page with slots on right
      return { left: 'cover', right: 0 }
    }
    // After cover: pages 1-2, 3-4, etc.
    const leftPageIndex = currentSpread * 2 - 1
    const rightPageIndex = leftPageIndex + 1
    return {
      left: leftPageIndex < TOTAL_PAGES ? leftPageIndex : null,
      right: rightPageIndex < TOTAL_PAGES ? rightPageIndex : null
    }
  }

  const spread = getSpreadPages()

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <p>Loading binder...</p>
      </div>
    )
  }

  const renderPage = (pageContent, pageIndex) => {
    if (pageContent === 'cover') {
      return (
        <div style={{
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #1a1a2e 0%, #0d0d1a 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px'
        }}>
          <div style={{
            fontSize: '2rem',
            fontWeight: 'bold',
            color: '#646cff',
            textAlign: 'center',
            marginBottom: '0.5rem'
          }}>
            PALMS OFF
          </div>
          <div style={{
            fontSize: '1rem',
            color: '#888',
            textAlign: 'center'
          }}>
            GAMING
          </div>
          <div style={{
            fontSize: '0.8rem',
            color: '#555',
            marginTop: '1rem'
          }}>
            216 Card Binder
          </div>
        </div>
      )
    }

    if (pageContent === 'black') {
      return (
        <div style={{
          width: '100%',
          height: '100%',
          background: '#0a0a0a',
          borderRadius: '4px'
        }} />
      )
    }

    if (pageContent === null) {
      return (
        <div style={{
          width: '100%',
          height: '100%',
          background: '#0d0d1a',
          borderRadius: '4px'
        }} />
      )
    }

    // Regular page with slots
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '6px',
        width: '100%',
        height: '100%',
        padding: '8px',
        background: '#0d0d1a',
        borderRadius: '4px',
        boxSizing: 'border-box'
      }}>
        {pages[pageContent]?.map((card, slotIndex) => (
          <div
            key={slotIndex}
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(pageContent, slotIndex)}
            style={{
              background: card ? 'transparent' : '#1a1a2e',
              borderRadius: '4px',
              border: card ? 'none' : '1px dashed #333',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              aspectRatio: '2.5/3.5',
              overflow: 'hidden'
            }}
          >
            {card ? (
              <>
                <img
                  src={card.image_url}
                  alt={card.product_name}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    borderRadius: '3px'
                  }}
                />
                <button
                  onClick={() => handleRemoveCard(pageContent, slotIndex)}
                  style={{
                    position: 'absolute',
                    top: '2px',
                    right: '2px',
                    background: 'rgba(255,0,0,0.8)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '16px',
                    height: '16px',
                    cursor: 'pointer',
                    color: 'white',
                    fontSize: '10px',
                    lineHeight: '1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  ×
                </button>
              </>
            ) : null}
          </div>
        ))}
      </div>
    )
  }

  const usedCount = usedCardIds.size

  return (
    <div>
      <div className="page-header">
        <h1>Virtual Binder</h1>
        <p>{usedCount} / {TOTAL_SLOTS} slots filled | {availableCards.length} cards available</p>
        {saveStatus && (
          <p style={{ color: saveStatus === 'Saved!' ? '#4ade80' : saveStatus === 'Error saving' ? '#ff6b6b' : '#888', fontSize: '0.9rem' }}>
            {saveStatus}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        {/* Binder Book View */}
        <div style={{ flex: '1', minWidth: '500px' }}>
          {/* Navigation */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '1rem',
            marginBottom: '1rem'
          }}>
            <button
              className="btn btn-secondary"
              onClick={() => setCurrentSpread(Math.max(0, currentSpread - 1))}
              disabled={currentSpread === 0}
            >
              ← Previous
            </button>
            <span style={{ minWidth: '120px', textAlign: 'center' }}>
              {currentSpread === 0 ? 'Cover + Page 1' : `Pages ${currentSpread * 2}-${Math.min(currentSpread * 2 + 1, TOTAL_PAGES)}`}
            </span>
            <button
              className="btn btn-secondary"
              onClick={() => setCurrentSpread(Math.min(totalSpreads - 1, currentSpread + 1))}
              disabled={currentSpread === totalSpreads - 1}
            >
              Next →
            </button>
          </div>

          {/* Book */}
          <div style={{
            display: 'flex',
            background: '#2a2a3e',
            borderRadius: '8px',
            padding: '12px',
            gap: '8px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
          }}>
            {/* Left Page */}
            <div style={{
              flex: 1,
              aspectRatio: '3/4',
              minHeight: '400px'
            }}>
              {renderPage(spread.left, spread.left)}
            </div>

            {/* Spine */}
            <div style={{
              width: '4px',
              background: 'linear-gradient(to bottom, #333, #222, #333)',
              borderRadius: '2px'
            }} />

            {/* Right Page */}
            <div style={{
              flex: 1,
              aspectRatio: '3/4',
              minHeight: '400px'
            }}>
              {renderPage(spread.right, spread.right)}
            </div>
          </div>
        </div>

        {/* Collection Sidebar */}
        <div style={{ width: '280px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem'
          }}>
            <h3 style={{ margin: 0 }}>Available Cards</h3>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowCollection(!showCollection)}
            >
              {showCollection ? 'Hide' : 'Show'}
            </button>
          </div>

          {showCollection && (
            <div style={{
              background: '#1a1a2e',
              borderRadius: '8px',
              padding: '10px'
            }}>
              <input
                type="text"
                placeholder="Search cards..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  marginBottom: '10px',
                  borderRadius: '4px',
                  border: '1px solid #333',
                  background: '#0d0d1a',
                  color: '#fff',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box'
                }}
              />
              <div style={{ maxHeight: '450px', overflowY: 'auto' }}>
              {availableCards.length === 0 ? (
                <p style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>
                  All cards are in the binder!
                </p>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '6px'
                }}>
                  {availableCards.map((card) => (
                    <div
                      key={card.id}
                      draggable
                      onDragStart={() => handleDragStart(card)}
                      style={{
                        cursor: 'grab',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        border: '2px solid transparent',
                        transition: 'border-color 0.2s, transform 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#646cff'
                        e.currentTarget.style.transform = 'scale(1.02)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'transparent'
                        e.currentTarget.style.transform = 'scale(1)'
                      }}
                    >
                      <img
                        src={card.image_url}
                        alt={card.product_name}
                        style={{
                          width: '100%',
                          aspectRatio: '2.5/3.5',
                          objectFit: 'cover',
                          display: 'block'
                        }}
                        draggable={false}
                      />
                    </div>
                  ))}
                </div>
              )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Binder
