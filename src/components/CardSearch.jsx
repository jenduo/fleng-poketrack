import { useState } from 'react'
import { useCollection } from '../hooks/useCollection'
import { useWishlist } from '../hooks/useWishlist'

function CardSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedCard, setSelectedCard] = useState(null)
  const [addMode, setAddMode] = useState(null) // 'collection' or 'wishlist'
  const [quantity, setQuantity] = useState(1)
  const [condition, setCondition] = useState('Near Mint')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [priority, setPriority] = useState('medium')
  const [notes, setNotes] = useState('')

  const { addCard } = useCollection()
  const { addToWishlist } = useWishlist()

  const searchCards = async (e) => {
    e.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `https://api.pokemontcg.io/v2/cards?q=name:"${encodeURIComponent(query)}*"&pageSize=12&select=id,name,images,set,cardmarket`
      )
      const data = await response.json()
      setResults(data.data || [])
    } catch (err) {
      setError('Failed to search cards. Please try again.')
      console.error('Search error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAddToCollection = async () => {
    if (!selectedCard) return

    try {
      await addCard({
        cardId: selectedCard.id,
        name: selectedCard.name,
        set: selectedCard.set.name,
        imageUrl: selectedCard.images.small,
        marketPrice: selectedCard.cardmarket?.prices?.averageSellPrice || null,
        quantity: quantity,
        condition: condition,
        purchasePrice: purchasePrice ? parseFloat(purchasePrice) : null
      })
      closeModal()
    } catch (err) {
      console.error('Error adding to collection:', err)
    }
  }

  const handleAddToWishlist = async () => {
    if (!selectedCard) return

    try {
      await addToWishlist({
        cardId: selectedCard.id,
        name: selectedCard.name,
        set: selectedCard.set.name,
        imageUrl: selectedCard.images.small,
        marketPrice: selectedCard.cardmarket?.prices?.averageSellPrice || null
      }, priority, notes)
      closeModal()
    } catch (err) {
      console.error('Error adding to wishlist:', err)
    }
  }

  const openModal = (card, mode) => {
    setSelectedCard(card)
    setAddMode(mode)
    // Reset form
    setQuantity(1)
    setCondition('Near Mint')
    setPurchasePrice('')
    setPriority('medium')
    setNotes('')
  }

  const closeModal = () => {
    setSelectedCard(null)
    setAddMode(null)
  }

  return (
    <div>
      <div className="page-header">
        <h1>Search Cards</h1>
        <p>Find Pokemon cards to add to your collection or wishlist</p>
      </div>

      <div className="search-container">
        <form onSubmit={searchCards}>
          <div className="search-input-wrapper">
            <input
              type="text"
              className="search-input"
              placeholder="Search by Pokemon name (e.g., Charizard, Pikachu)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>
      </div>

      {error && (
        <div style={{ color: 'var(--danger)', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {loading && (
        <div className="loading">
          <div className="loading-spinner"></div>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="cards-grid">
          {results.map(card => (
            <div key={card.id} className="pokemon-card">
              <img src={card.images.small} alt={card.name} />
              <div className="pokemon-card-info">
                <div className="pokemon-card-name">{card.name}</div>
                <div className="pokemon-card-set">{card.set.name}</div>
                {card.cardmarket?.prices?.averageSellPrice && (
                  <div className="pokemon-card-price">
                    ${card.cardmarket.prices.averageSellPrice.toFixed(2)}
                  </div>
                )}
                <div className="pokemon-card-actions">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => openModal(card, 'collection')}
                  >
                    + Collection
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => openModal(card, 'wishlist')}
                  >
                    + Wishlist
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && query && results.length === 0 && (
        <div className="empty-state">
          <h3>No cards found</h3>
          <p>Try a different search term.</p>
        </div>
      )}

      {/* Add to Collection Modal */}
      {selectedCard && addMode === 'collection' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add to Collection</h2>
              <button className="modal-close" onClick={closeModal}>&times;</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                <img
                  src={selectedCard.images.small}
                  alt={selectedCard.name}
                  style={{ width: '100px', borderRadius: '8px' }}
                />
                <div>
                  <h3>{selectedCard.name}</h3>
                  <p style={{ color: 'var(--text-secondary)' }}>{selectedCard.set.name}</p>
                  {selectedCard.cardmarket?.prices?.averageSellPrice && (
                    <p style={{ color: 'var(--success)', fontWeight: '600' }}>
                      Market: ${selectedCard.cardmarket.prices.averageSellPrice.toFixed(2)}
                    </p>
                  )}
                </div>
              </div>

              <div className="form-group">
                <label>Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                />
              </div>

              <div className="form-group">
                <label>Condition</label>
                <select value={condition} onChange={(e) => setCondition(e.target.value)}>
                  <option>Mint</option>
                  <option>Near Mint</option>
                  <option>Lightly Played</option>
                  <option>Moderately Played</option>
                  <option>Heavily Played</option>
                  <option>Damaged</option>
                </select>
              </div>

              <div className="form-group">
                <label>Purchase Price (optional)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddToCollection}>
                Add to Collection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add to Wishlist Modal */}
      {selectedCard && addMode === 'wishlist' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add to Wishlist</h2>
              <button className="modal-close" onClick={closeModal}>&times;</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                <img
                  src={selectedCard.images.small}
                  alt={selectedCard.name}
                  style={{ width: '100px', borderRadius: '8px' }}
                />
                <div>
                  <h3>{selectedCard.name}</h3>
                  <p style={{ color: 'var(--text-secondary)' }}>{selectedCard.set.name}</p>
                  {selectedCard.cardmarket?.prices?.averageSellPrice && (
                    <p style={{ color: 'var(--success)', fontWeight: '600' }}>
                      Market: ${selectedCard.cardmarket.prices.averageSellPrice.toFixed(2)}
                    </p>
                  )}
                </div>
              </div>

              <div className="form-group">
                <label>Priority</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                  <option value="high">High - Must have!</option>
                  <option value="medium">Medium - Would like</option>
                  <option value="low">Low - Nice to have</option>
                </select>
              </div>

              <div className="form-group">
                <label>Notes (optional)</label>
                <input
                  type="text"
                  placeholder="e.g., Looking for PSA 10"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddToWishlist}>
                Add to Wishlist
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CardSearch
