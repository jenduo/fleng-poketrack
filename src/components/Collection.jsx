import { useState } from 'react'
import { useCollection } from '../hooks/useCollection'
import { Link } from 'react-router-dom'

function Collection() {
  const { cards, loading, removeCard, updateCard } = useCollection()
  const [filter, setFilter] = useState('')
  const [editingCard, setEditingCard] = useState(null)

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
      </div>
    )
  }

  const filteredCards = cards.filter(card =>
    card.name.toLowerCase().includes(filter.toLowerCase()) ||
    card.set.toLowerCase().includes(filter.toLowerCase())
  )

  const handleDelete = async (cardId) => {
    if (window.confirm('Remove this card from your collection?')) {
      await removeCard(cardId)
    }
  }

  const handleQuantityChange = async (card, delta) => {
    const newQuantity = (card.quantity || 1) + delta
    if (newQuantity < 1) {
      handleDelete(card.id)
    } else {
      await updateCard(card.id, { quantity: newQuantity })
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>My Collection</h1>
        <p>{cards.length} unique cards</p>
      </div>

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

      {filteredCards.length > 0 ? (
        <div className="cards-grid">
          {filteredCards.map(card => (
            <div key={card.id} className="pokemon-card">
              {card.quantity > 1 && (
                <span className="quantity-badge">x{card.quantity}</span>
              )}
              <img src={card.imageUrl} alt={card.name} />
              <div className="pokemon-card-info">
                <div className="pokemon-card-name">{card.name}</div>
                <div className="pokemon-card-set">{card.set}</div>
                {card.purchasePrice && (
                  <div className="pokemon-card-price">${card.purchasePrice.toFixed(2)}</div>
                )}
                <div className="pokemon-card-actions">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleQuantityChange(card, -1)}
                  >
                    -
                  </button>
                  <span style={{ padding: '0 0.5rem' }}>{card.quantity || 1}</span>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleQuantityChange(card, 1)}
                  >
                    +
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDelete(card.id)}
                    style={{ marginLeft: 'auto' }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : cards.length === 0 ? (
        <div className="empty-state">
          <h3>Your collection is empty</h3>
          <p>Search for cards to add to your collection!</p>
          <Link to="/search" className="btn btn-primary">
            Search Cards
          </Link>
        </div>
      ) : (
        <div className="empty-state">
          <h3>No matching cards</h3>
          <p>Try a different search term.</p>
        </div>
      )}
    </div>
  )
}

export default Collection
