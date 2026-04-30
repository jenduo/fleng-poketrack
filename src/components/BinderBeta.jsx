import { useState, useEffect, useMemo } from 'react'
import { db } from '../firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { readCollectionsFromFirestore } from '../lib/collectrStorage'

const TOTAL_SLOTS = 216
const SLOTS_PER_PAGE = 9
const TOTAL_PAGES = TOTAL_SLOTS / SLOTS_PER_PAGE // 24 pages

function BinderBeta() {
  const [pages, setPages] = useState(() =>
    Array(TOTAL_PAGES).fill(null).map(() => Array(SLOTS_PER_PAGE).fill(null))
  )
  const [currentSpread, setCurrentSpread] = useState(0)
  const [collections, setCollections] = useState({})
  const [collectionIndex, setCollectionIndex] = useState(0)
  const [usedCardIds, setUsedCardIds] = useState(new Set())
  const [scratchCards, setScratchCards] = useState([])
  const [loading, setLoading] = useState(true)
  // selection: array of { card, source } where source is
  //   { type: 'available' } | { type: 'scratch' } | { type: 'binder', pageIndex, slotIndex }
  const [selection, setSelection] = useState([])
  const [showCollection, setShowCollection] = useState(true)
  const [showScratch, setShowScratch] = useState(true)
  const [searchFilter, setSearchFilter] = useState('')
  const [saveStatus, setSaveStatus] = useState('')
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia('(max-width: 700px)')
    const handler = (e) => setIsMobile(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    const loadData = async () => {
      try {
        const binderRef = doc(db, 'binders', 'playground')
        const binderSnap = await getDoc(binderRef)
        if (binderSnap.exists()) {
          const data = binderSnap.data()
          if (data.pages) {
            const pagesArray = Array(TOTAL_PAGES).fill(null).map((_, i) =>
              data.pages[`page_${i}`] || Array(SLOTS_PER_PAGE).fill(null)
            )
            setPages(pagesArray)
          }
          if (data.usedCardIds) setUsedCardIds(new Set(data.usedCardIds))
          if (Array.isArray(data.scratchCards)) setScratchCards(data.scratchCards)
        }

        setCollections(await readCollectionsFromFirestore())
      } catch (error) {
        console.error('Error loading data:', error)
      }
      setLoading(false)
    }
    loadData()
  }, [])

  const sanitizeCard = (card) => ({
    id: card.id || null,
    product_name: card.product_name || null,
    image_url: card.image_url || null,
    catalog_group: card.catalog_group || null,
    variant: card.variant || null,
    price: card.price || null
  })

  const saveBinder = async (newPages, newUsedIds, newScratch = scratchCards) => {
    setPages(newPages)
    setUsedCardIds(newUsedIds)
    setScratchCards(newScratch)
    setSaveStatus('Saving...')
    try {
      const pagesObject = {}
      newPages.forEach((page, pageIndex) => {
        pagesObject[`page_${pageIndex}`] = page.map(card => card ? sanitizeCard(card) : null)
      })

      await setDoc(doc(db, 'binders', 'playground'), {
        pages: pagesObject,
        usedCardIds: Array.from(newUsedIds),
        scratchCards: newScratch.map(sanitizeCard)
      })
      setSaveStatus('Saved!')
      setTimeout(() => setSaveStatus(''), 2000)
    } catch (error) {
      console.error('Error saving binder:', error.message, error.code, error)
      setSaveStatus('Error: ' + (error.message || 'Unknown'))
    }
  }

  const clearSelection = () => setSelection([])
  const hasSelection = selection.length > 0

  const isInSelection = (cardId) => selection.some(s => s.card.id === cardId)
  const isAvailableSelected = (cardId) =>
    selection.some(s => s.card.id === cardId && s.source.type === 'available')
  const isScratchSelected = (cardId) =>
    selection.some(s => s.card.id === cardId && s.source.type === 'scratch')
  const isBinderSelected = (pageIndex, slotIndex) =>
    selection.some(s =>
      s.source.type === 'binder' &&
      s.source.pageIndex === pageIndex &&
      s.source.slotIndex === slotIndex
    )
  const selectionHasNonScratch = selection.some(s => s.source.type !== 'scratch')
  const selectionHasNonAvailable = selection.some(s => s.source.type !== 'available')

  const toggleSelection = (card, source) => {
    setSelection(prev => {
      const sameIdx = prev.findIndex(s => {
        if (s.card.id !== card.id) return false
        if (s.source.type !== source.type) return false
        if (source.type === 'binder') {
          return s.source.pageIndex === source.pageIndex && s.source.slotIndex === source.slotIndex
        }
        return true
      })
      if (sameIdx >= 0) return prev.filter((_, i) => i !== sameIdx)
      // Don't allow same card from two sources at once
      const filtered = prev.filter(s => s.card.id !== card.id)
      return [...filtered, { card, source }]
    })
  }

  const handleDragOver = (e) => e.preventDefault()

  const handleSelectCard = (card) => toggleSelection(card, { type: 'available' })
  const handlePickupScratch = (cardId) => {
    const card = scratchCards.find(c => c.id === cardId)
    if (!card) return
    toggleSelection(card, { type: 'scratch' })
  }
  const handlePickupSlot = (pageIndex, slotIndex) => {
    const card = pages[pageIndex][slotIndex]
    if (!card) return
    toggleSelection(card, { type: 'binder', pageIndex, slotIndex })
  }

  const handleDragStart = (card) => {
    if (!isInSelection(card.id)) {
      setSelection([{ card, source: { type: 'available' } }])
    }
  }
  const handleSlotDragStart = (pageIndex, slotIndex, e) => {
    const card = pages[pageIndex][slotIndex]
    if (!card) {
      if (e) e.preventDefault()
      return
    }
    if (!isBinderSelected(pageIndex, slotIndex)) {
      setSelection([{ card, source: { type: 'binder', pageIndex, slotIndex } }])
    }
  }
  const handleScratchDragStart = (card, e) => {
    if (!card) {
      if (e) e.preventDefault()
      return
    }
    if (!isScratchSelected(card.id)) {
      setSelection([{ card, source: { type: 'scratch' } }])
    }
  }

  const handleDrop = (pageIndex, slotIndex) => {
    if (!hasSelection) return
    // Drop target must be empty (or a slot that's in our selection — its card will move out)
    if (pages[pageIndex][slotIndex] !== null && !isBinderSelected(pageIndex, slotIndex)) return

    const newPages = pages.map(page => [...page])
    // Free up all binder source slots first so they count as empty
    selection.forEach(s => {
      if (s.source.type === 'binder') {
        newPages[s.source.pageIndex][s.source.slotIndex] = null
      }
    })

    // Build placement order:
    //   1. Drop target slot (if empty)
    //   2. Other empty slots on the drop page (in order)
    //   3. Empty slots on subsequent pages (last resort, in page order)
    const placement = []
    if (newPages[pageIndex][slotIndex] === null) {
      placement.push({ pageIndex, slotIndex })
    }
    for (let s = 0; s < SLOTS_PER_PAGE; s++) {
      if (s === slotIndex) continue
      if (newPages[pageIndex][s] === null) {
        placement.push({ pageIndex, slotIndex: s })
      }
    }
    for (let p = pageIndex + 1; p < TOTAL_PAGES; p++) {
      for (let s = 0; s < SLOTS_PER_PAGE; s++) {
        if (newPages[p][s] === null) {
          placement.push({ pageIndex: p, slotIndex: s })
        }
      }
    }

    const newUsedIds = new Set(usedCardIds)
    const placedScratchIds = new Set()
    selection.forEach((s, i) => {
      if (i >= placement.length) return // overflow: card stays in source
      const { pageIndex: tp, slotIndex: ts } = placement[i]
      newPages[tp][ts] = s.card
      newUsedIds.add(s.card.id)
      if (s.source.type === 'scratch') placedScratchIds.add(s.card.id)
    })

    // Cards that didn't get placed (overflow): re-add their binder source so they're not lost
    selection.slice(placement.length).forEach(s => {
      if (s.source.type === 'binder') {
        newPages[s.source.pageIndex][s.source.slotIndex] = s.card
      }
    })

    const newScratch = placedScratchIds.size > 0
      ? scratchCards.filter(c => !placedScratchIds.has(c.id))
      : scratchCards

    saveBinder(newPages, newUsedIds, newScratch)
    clearSelection()
  }

  const handleDropToScratch = () => {
    if (!hasSelection) return

    const existingIds = new Set(scratchCards.map(c => c.id))
    const additions = selection
      .filter(s => s.source.type !== 'scratch' && !existingIds.has(s.card.id))
      .map(s => s.card)
    const newScratch = additions.length > 0 ? [...scratchCards, ...additions] : scratchCards

    let newPages = pages
    let newUsedIds = usedCardIds
    const binderSources = selection.filter(s => s.source.type === 'binder')
    if (binderSources.length > 0) {
      newPages = pages.map(page => [...page])
      newUsedIds = new Set(usedCardIds)
      binderSources.forEach(s => {
        newPages[s.source.pageIndex][s.source.slotIndex] = null
        newUsedIds.delete(s.card.id)
      })
    }

    saveBinder(newPages, newUsedIds, newScratch)
    clearSelection()
  }

  const handleDropToAvailable = () => {
    if (!hasSelection) return

    let newPages = pages
    let newUsedIds = usedCardIds
    let newScratch = scratchCards

    const binderSources = selection.filter(s => s.source.type === 'binder')
    if (binderSources.length > 0) {
      newPages = pages.map(page => [...page])
      newUsedIds = new Set(usedCardIds)
      binderSources.forEach(s => {
        newPages[s.source.pageIndex][s.source.slotIndex] = null
        newUsedIds.delete(s.card.id)
      })
    }
    const scratchSources = selection.filter(s => s.source.type === 'scratch')
    if (scratchSources.length > 0) {
      const removeIds = new Set(scratchSources.map(s => s.card.id))
      newScratch = scratchCards.filter(c => !removeIds.has(c.id))
    }

    saveBinder(newPages, newUsedIds, newScratch)
    clearSelection()
  }

  const handleRemoveScratch = (cardId) => {
    const newScratch = scratchCards.filter(c => c.id !== cardId)
    saveBinder(pages, usedCardIds, newScratch)
    if (isScratchSelected(cardId)) {
      setSelection(prev => prev.filter(s => !(s.card.id === cardId && s.source.type === 'scratch')))
    }
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

  // Cycle order: ["All", ...non-Sold collection names]
  const collectionCycle = useMemo(() => {
    const names = Object.keys(collections)
      .filter(name => name.toLowerCase() !== 'sold')
      .sort()
    return ['All', ...names]
  }, [collections])

  // Clamp collection index when collection list changes
  useEffect(() => {
    if (collectionIndex >= collectionCycle.length && collectionCycle.length > 0) {
      setCollectionIndex(0)
    }
  }, [collectionCycle, collectionIndex])

  const activeCollectionName = collectionCycle[collectionIndex] || 'All'

  const activeCards = useMemo(() => {
    if (activeCollectionName === 'All') {
      const seen = new Set()
      const merged = []
      Object.entries(collections).forEach(([name, cards]) => {
        if (name.toLowerCase() === 'sold') return
        ;(cards || []).forEach(card => {
          if (!card?.id || seen.has(card.id)) return
          seen.add(card.id)
          merged.push(card)
        })
      })
      return merged
    }
    return collections[activeCollectionName] || []
  }, [collections, activeCollectionName])

  const scratchIds = useMemo(() => new Set(scratchCards.map(c => c.id)), [scratchCards])

  const availableCards = activeCards
    .filter(card => !usedCardIds.has(card.id) && !scratchIds.has(card.id))
    .filter(card =>
      searchFilter === '' ||
      card.product_name?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      card.catalog_group?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      card.card_number?.toLowerCase().includes(searchFilter.toLowerCase())
    )

  // No cover: just pages. Mobile = 1 page per spread, desktop = 2.
  const totalSpreads = isMobile ? TOTAL_PAGES : Math.ceil(TOTAL_PAGES / 2)

  const getSpreadPages = () => {
    if (isMobile) {
      return { left: currentSpread, right: null }
    }
    const leftPageIndex = currentSpread * 2
    const rightPageIndex = leftPageIndex + 1
    return {
      left: leftPageIndex < TOTAL_PAGES ? leftPageIndex : null,
      right: rightPageIndex < TOTAL_PAGES ? rightPageIndex : null
    }
  }

  useEffect(() => {
    if (currentSpread >= totalSpreads) setCurrentSpread(totalSpreads - 1)
  }, [isMobile, totalSpreads, currentSpread])

  const spread = getSpreadPages()

  const cycleCollection = (delta) => {
    if (collectionCycle.length === 0) return
    setCollectionIndex(prev => {
      const next = (prev + delta + collectionCycle.length) % collectionCycle.length
      return next
    })
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <p>Loading playground...</p>
      </div>
    )
  }

  const renderPage = (pageContent) => {
    if (pageContent === null) {
      return (
        <div style={{
          width: '100%', height: '100%',
          background: 'var(--bg-ink)', borderRadius: '3px',
          border: '1px solid var(--rule)'
        }} />
      )
    }

    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '8px',
        width: '100%',
        height: '100%',
        padding: '12px',
        background: 'var(--bg-ink)',
        borderRadius: '3px',
        border: '1px solid var(--rule)',
        boxSizing: 'border-box',
        position: 'relative'
      }}>
        <span style={{
          position: 'absolute', bottom: '0.6rem', right: '0.85rem',
          fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
          color: 'var(--fg-3)', letterSpacing: '0.18em'
        }}>
          {String(pageContent + 1).padStart(2, '0')}
        </span>

        {pages[pageContent]?.map((card, slotIndex) => {
          const isHotDrop = hasSelection && !card
          const isSourceSlot = !!card && isBinderSelected(pageContent, slotIndex)
          return (
            <div
              key={slotIndex}
              draggable={!!card}
              onDragStart={(e) => handleSlotDragStart(pageContent, slotIndex, e)}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(pageContent, slotIndex)}
              onClick={() => {
                if (card) {
                  handlePickupSlot(pageContent, slotIndex)
                } else if (hasSelection) {
                  handleDrop(pageContent, slotIndex)
                }
              }}
              style={{
                background: card ? 'transparent' : (isHotDrop ? 'rgba(155,126,255,0.06)' : 'rgba(255,255,255,0.012)'),
                borderRadius: '3px',
                border: isSourceSlot
                  ? '1px dashed var(--accent)'
                  : card
                    ? '1px solid var(--rule-soft)'
                    : (isHotDrop ? '1px dashed var(--accent)' : '1px dashed var(--rule)'),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                aspectRatio: '2.5/3.5',
                overflow: 'hidden',
                cursor: card ? 'pointer' : (isHotDrop ? 'pointer' : 'default'),
                opacity: isSourceSlot ? 0.4 : 1,
                transition: 'background 160ms ease, border-color 160ms ease, opacity 160ms ease'
              }}
            >
              {card ? (
                <>
                  <img
                    src={card.image_url}
                    alt={card.product_name}
                    draggable={false}
                    style={{
                      width: '100%', height: '100%',
                      objectFit: 'cover', borderRadius: '2px'
                    }}
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemoveCard(pageContent, slotIndex) }}
                    title="Remove card"
                    aria-label="Remove card"
                    style={{
                      position: 'absolute',
                      top: '4px', right: '4px',
                      background: 'rgba(11,11,20,0.78)',
                      backdropFilter: 'blur(6px)',
                      WebkitBackdropFilter: 'blur(6px)',
                      border: '1px solid var(--rule-strong)',
                      borderRadius: '999px',
                      width: '18px', height: '18px',
                      cursor: 'pointer',
                      color: 'var(--fg-1)',
                      fontSize: '11px',
                      lineHeight: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: 0,
                      transition: 'color 160ms, border-color 160ms'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.borderColor = 'var(--danger)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-1)'; e.currentTarget.style.borderColor = 'var(--rule-strong)' }}
                  >
                    ×
                  </button>
                </>
              ) : null}
            </div>
          )
        })}
      </div>
    )
  }

  const usedCount = usedCardIds.size

  return (
    <div>
      <div className="page-header">
        <span className="kicker">// 02b Playground · Beta</span>
        <h1>Binder playground.</h1>
        <p>{usedCount} / {TOTAL_SLOTS} slots filled · {availableCards.length} cards available · {activeCollectionName}</p>
        {saveStatus && (
          <p style={{
            color: saveStatus === 'Saved!' ? 'var(--mint)'
              : saveStatus.startsWith('Error') ? 'var(--danger)'
              : 'var(--fg-2)',
            fontSize: '0.74rem',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            marginTop: '0.5rem'
          }}>
            ⏺ {saveStatus}
          </p>
        )}
      </div>

      <div className="binder-layout" style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 300px',
        gap: '2rem',
        alignItems: 'start'
      }}>
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            marginBottom: '1.25rem'
          }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setCurrentSpread(Math.max(0, currentSpread - 1))}
              disabled={currentSpread === 0}
              aria-label="Previous spread"
            >
              ← Prev
            </button>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline'
              }}>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.68rem',
                  letterSpacing: '0.18em',
                  color: 'var(--fg-2)',
                  textTransform: 'uppercase'
                }}>
                  {isMobile
                    ? `Page ${String(currentSpread + 1).padStart(2, '0')}`
                    : `Pages ${String(currentSpread * 2 + 1).padStart(2, '0')} – ${String(Math.min(currentSpread * 2 + 2, TOTAL_PAGES)).padStart(2, '0')}`}
                </span>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.65rem',
                  letterSpacing: '0.16em',
                  color: 'var(--fg-3)'
                }}>
                  {String(currentSpread + 1).padStart(2, '0')} / {String(totalSpreads).padStart(2, '0')}
                </span>
              </div>
              <div style={{
                width: '100%', height: '1px', background: 'var(--rule)', position: 'relative'
              }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${((currentSpread + 1) / totalSpreads) * 100}%`,
                  background: 'var(--accent)',
                  transition: 'width 240ms cubic-bezier(0.2, 0.7, 0.2, 1)'
                }} />
              </div>
            </div>

            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setCurrentSpread(Math.min(totalSpreads - 1, currentSpread + 1))}
              disabled={currentSpread === totalSpreads - 1}
              aria-label="Next spread"
            >
              Next →
            </button>
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'center',
            background: 'var(--bg-1)',
            border: '1px solid var(--rule)',
            borderRadius: '6px',
            padding: isMobile ? '10px' : '14px',
            gap: '10px',
            boxShadow: '0 1px 0 rgba(255,255,255,0.025) inset, 0 24px 60px -32px rgba(0,0,0,0.7)'
          }}>
            <div style={{
              flex: 1,
              aspectRatio: isMobile ? '5/7' : '3/4',
              minHeight: isMobile ? '320px' : '420px',
              maxWidth: isMobile ? '420px' : 'none'
            }}>
              {renderPage(spread.left)}
            </div>

            {!isMobile && (
              <>
                <div style={{
                  width: '1px',
                  background: 'linear-gradient(to bottom, transparent 0%, var(--rule-strong) 20%, rgba(155,126,255,0.4) 50%, var(--rule-strong) 80%, transparent 100%)',
                  position: 'relative'
                }} />

                <div style={{ flex: 1, aspectRatio: '3/4', minHeight: '420px' }}>
                  {renderPage(spread.right)}
                </div>
              </>
            )}
          </div>
        </div>

        <aside>
          {/* === Scratch / Playground queue (on top) === */}
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: '0.85rem'
            }}>
              <div>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.66rem',
                  letterSpacing: '0.22em',
                  color: 'var(--mint, #86e1c0)',
                  textTransform: 'uppercase',
                  marginBottom: '0.3rem'
                }}>// Scratch</div>
                <h2 style={{
                  margin: 0,
                  fontFamily: 'var(--font-display)',
                  fontWeight: 400,
                  fontVariationSettings: '"opsz" 72, "SOFT" 30',
                  fontSize: '1.25rem',
                  letterSpacing: '-0.015em',
                  color: 'var(--fg-0)'
                }}>Playing with</h2>
              </div>
              <button
                onClick={() => setShowScratch(!showScratch)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--rule-strong)',
                  color: 'var(--fg-1)',
                  padding: '0.32rem 0.65rem',
                  borderRadius: '3px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.65rem',
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'all 160ms'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--fg-2)'; e.currentTarget.style.color = 'var(--fg-0)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--rule-strong)'; e.currentTarget.style.color = 'var(--fg-1)' }}
              >
                {showScratch ? 'Hide' : 'Show'}
              </button>
            </div>

            {showScratch && (() => {
              const existingScratchIds = new Set(scratchCards.map(c => c.id))
              const isHotDrop = hasSelection && selection.some(s =>
                s.source.type !== 'scratch' && !existingScratchIds.has(s.card.id)
              )
              return (
                <div
                  onDragOver={handleDragOver}
                  onDrop={(e) => { e.preventDefault(); handleDropToScratch() }}
                  onClick={() => { if (isHotDrop) handleDropToScratch() }}
                  style={{
                    background: isHotDrop ? 'rgba(134,225,192,0.05)' : 'var(--bg-1)',
                    border: isHotDrop ? '1px dashed var(--mint, #86e1c0)' : '1px solid var(--rule)',
                    borderRadius: '4px',
                    padding: '12px',
                    minHeight: '120px',
                    cursor: isHotDrop ? 'pointer' : 'default',
                    transition: 'background 160ms, border-color 160ms'
                  }}
                >
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.62rem',
                    letterSpacing: '0.16em',
                    color: 'var(--fg-3)',
                    textTransform: 'uppercase',
                    marginBottom: '0.55rem',
                    padding: '0 0.1rem'
                  }}>
                    <span>{scratchCards.length} card{scratchCards.length === 1 ? '' : 's'}</span>
                    {isHotDrop && <span style={{ color: 'var(--mint, #86e1c0)' }}>↓ drop</span>}
                  </div>

                  {scratchCards.length === 0 ? (
                    <p style={{
                      fontFamily: 'var(--font-display)',
                      fontStyle: 'italic',
                      color: 'var(--fg-2)',
                      textAlign: 'center',
                      padding: '1.5rem 0.5rem',
                      fontSize: '0.95rem',
                      margin: 0
                    }}>
                      Drag or click cards here to play with.
                    </p>
                  ) : (
                    <div style={{ maxHeight: '460px', overflowY: 'auto', paddingRight: '4px' }}>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
                        gap: '8px'
                      }}>
                      {scratchCards.map((card) => {
                        const isSelected = isScratchSelected(card.id)
                        return (
                          <div
                            key={card.id}
                            draggable
                            onDragStart={(e) => handleScratchDragStart(card, e)}
                            onClick={(e) => { e.stopPropagation(); handlePickupScratch(card.id) }}
                            style={{
                              position: 'relative',
                              cursor: 'pointer',
                              borderRadius: '3px',
                              overflow: 'hidden',
                              border: isSelected ? '1px solid var(--accent)' : '1px solid var(--rule)',
                              background: 'var(--bg-2)',
                              transform: isSelected ? 'translateY(-1px)' : 'none',
                              boxShadow: isSelected ? '0 0 0 2px var(--accent-soft)' : 'none',
                              opacity: isSelected ? 0.65 : 1,
                              transition: 'border-color 160ms, transform 160ms, box-shadow 160ms, opacity 160ms',
                              touchAction: 'manipulation'
                            }}
                          >
                            <img
                              src={card.image_url}
                              alt={card.product_name}
                              draggable={false}
                              style={{
                                width: '100%',
                                aspectRatio: '2.5/3.5',
                                objectFit: 'cover',
                                display: 'block'
                              }}
                            />
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRemoveScratch(card.id) }}
                              title="Remove from scratch"
                              aria-label="Remove from scratch"
                              style={{
                                position: 'absolute',
                                top: '4px', right: '4px',
                                background: 'rgba(11,11,20,0.78)',
                                backdropFilter: 'blur(6px)',
                                WebkitBackdropFilter: 'blur(6px)',
                                border: '1px solid var(--rule-strong)',
                                borderRadius: '999px',
                                width: '18px', height: '18px',
                                cursor: 'pointer',
                                color: 'var(--fg-1)',
                                fontSize: '11px',
                                lineHeight: 1,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                padding: 0,
                                transition: 'color 160ms, border-color 160ms'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.borderColor = 'var(--danger)' }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-1)'; e.currentTarget.style.borderColor = 'var(--rule-strong)' }}
                            >
                              ×
                            </button>
                          </div>
                        )
                      })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>

          {/* === Available cards (also a drop target so cards can be dragged back to the queue) === */}
          {(() => {
            const isAvailableHotDrop = hasSelection && selectionHasNonAvailable
            return (
              <div
                onDragOver={handleDragOver}
                onDrop={(e) => { e.preventDefault(); handleDropToAvailable() }}
                style={{
                  marginTop: '1.25rem',
                  borderRadius: '4px',
                  outline: isAvailableHotDrop ? '1px dashed var(--accent)' : 'none',
                  outlineOffset: '4px',
                  transition: 'outline-color 160ms ease'
                }}
              >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: '0.85rem'
          }}>
            <div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.66rem',
                letterSpacing: '0.22em',
                color: 'var(--accent)',
                textTransform: 'uppercase',
                marginBottom: '0.3rem'
              }}>// Queue</div>
              <h2 style={{
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontWeight: 400,
                fontVariationSettings: '"opsz" 72, "SOFT" 30',
                fontSize: '1.25rem',
                letterSpacing: '-0.015em',
                color: 'var(--fg-0)'
              }}>Available cards</h2>
            </div>
            <button
              onClick={() => setShowCollection(!showCollection)}
              style={{
                background: 'transparent',
                border: '1px solid var(--rule-strong)',
                color: 'var(--fg-1)',
                padding: '0.32rem 0.65rem',
                borderRadius: '3px',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.65rem',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 160ms'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--fg-2)'; e.currentTarget.style.color = 'var(--fg-0)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--rule-strong)'; e.currentTarget.style.color = 'var(--fg-1)' }}
            >
              {showCollection ? 'Hide' : 'Show'}
            </button>
          </div>

          {showCollection && (
            <div style={{
              background: 'var(--bg-1)',
              border: '1px solid var(--rule)',
              borderRadius: '4px',
              padding: '12px'
            }}>
              {/* Collection cycler */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                marginBottom: '12px',
                padding: '6px 8px',
                border: '1px solid var(--rule)',
                borderRadius: '3px',
                background: 'var(--bg-2)'
              }}>
                <button
                  onClick={() => cycleCollection(-1)}
                  disabled={collectionCycle.length <= 1}
                  aria-label="Previous collection"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--fg-1)',
                    cursor: collectionCycle.length <= 1 ? 'not-allowed' : 'pointer',
                    fontSize: '0.95rem',
                    padding: '0 0.35rem',
                    opacity: collectionCycle.length <= 1 ? 0.4 : 1
                  }}
                >
                  ←
                </button>
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 0
                }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.58rem',
                    letterSpacing: '0.22em',
                    color: 'var(--fg-3)',
                    textTransform: 'uppercase'
                  }}>
                    {collectionCycle.length === 0
                      ? '— / —'
                      : `${String(collectionIndex + 1).padStart(2, '0')} / ${String(collectionCycle.length).padStart(2, '0')}`}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 400,
                    fontVariationSettings: '"opsz" 72',
                    fontSize: '0.95rem',
                    letterSpacing: '-0.01em',
                    color: 'var(--fg-0)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '100%'
                  }}>
                    {activeCollectionName}
                  </span>
                </div>
                <button
                  onClick={() => cycleCollection(1)}
                  disabled={collectionCycle.length <= 1}
                  aria-label="Next collection"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--fg-1)',
                    cursor: collectionCycle.length <= 1 ? 'not-allowed' : 'pointer',
                    fontSize: '0.95rem',
                    padding: '0 0.35rem',
                    opacity: collectionCycle.length <= 1 ? 0.4 : 1
                  }}
                >
                  →
                </button>
              </div>

              <div style={{ position: 'relative', marginBottom: '12px' }}>
                <span style={{
                  position: 'absolute', left: '0.7rem', top: '50%',
                  transform: 'translateY(-50%)', color: 'var(--fg-3)',
                  fontSize: '0.85rem', pointerEvents: 'none'
                }}>⌕</span>
                <input
                  type="text"
                  placeholder="Search…"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.7rem 0.55rem 1.85rem',
                    borderRadius: '3px',
                    border: '1px solid var(--rule)',
                    background: 'var(--bg-2)',
                    color: 'var(--fg-0)',
                    fontSize: '0.85rem',
                    fontFamily: 'var(--font-body)',
                    boxSizing: 'border-box',
                    outline: 'none',
                    transition: 'border-color 160ms ease, box-shadow 160ms ease'
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent-line)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-soft)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--rule)'; e.currentTarget.style.boxShadow = 'none' }}
                />
              </div>

              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.62rem',
                letterSpacing: '0.16em',
                color: 'var(--fg-3)',
                textTransform: 'uppercase',
                marginBottom: '0.55rem',
                padding: '0 0.1rem'
              }}>
                <span>{availableCards.length} card{availableCards.length === 1 ? '' : 's'}</span>
                {hasSelection && (
                  <span
                    onClick={clearSelection}
                    title="Clear selection"
                    style={{ color: 'var(--accent)', cursor: 'pointer' }}
                  >
                    ● {selection.length} selected · clear
                  </span>
                )}
              </div>

              <div style={{ maxHeight: '460px', overflowY: 'auto', paddingRight: '4px' }}>
                {availableCards.length === 0 ? (
                  <p style={{
                    fontFamily: 'var(--font-display)',
                    fontStyle: 'italic',
                    color: 'var(--fg-2)',
                    textAlign: 'center',
                    padding: '2.5rem 1rem 1rem',
                    fontSize: '1rem'
                  }}>
                    No cards in {activeCollectionName}.
                  </p>
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
                    gap: '8px'
                  }}>
                    {availableCards.map((card) => {
                      const isSelected = isAvailableSelected(card.id)
                      return (
                        <div
                          key={card.id}
                          draggable
                          onDragStart={() => handleDragStart(card)}
                          onClick={() => handleSelectCard(card)}
                          style={{
                            cursor: 'pointer',
                            borderRadius: '3px',
                            overflow: 'hidden',
                            border: isSelected ? '1px solid var(--accent)' : '1px solid var(--rule)',
                            background: 'var(--bg-2)',
                            transform: isSelected ? 'translateY(-1px)' : 'none',
                            boxShadow: isSelected ? '0 0 0 2px var(--accent-soft)' : 'none',
                            transition: 'border-color 160ms, transform 160ms, box-shadow 160ms',
                            touchAction: 'manipulation'
                          }}
                          onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--rule-strong)' }}
                          onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--rule)' }}
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
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

              </div>
            )
          })()}
        </aside>
      </div>
    </div>
  )
}

export default BinderBeta
