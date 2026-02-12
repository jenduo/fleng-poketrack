import { useState } from 'react'
import { useWishlist } from '../hooks/useWishlist'
import { useCollection } from '../hooks/useCollection'
import { Link } from 'react-router-dom'

function Wishlist() {
  const { wishlist, loading, removeFromWishlist } = useWishlist()
  const { addCard } = useCollection()
  const [filter, setFilter] = useState('')

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
      </div>
    )
  }

  const filteredWishlist = wishlist.filter(card =>
    card.name.toLowerCase().includes(filter.toLowerCase()) ||
    card.set.toLowerCase().includes(filter.toLowerCase())
  )

  const handleRemove = async (cardId) => {
    if (window.confirm('Remove this card from your wishlist?')) {
      await removeFromWishlist(cardId)
    }
  }

  const handleMoveToCollection = async (card) => {
    try {
      await addCard({
        name: card.name,
        set: card.set,
        imageUrl: card.imageUrl,
        cardId: card.cardId,
        marketPrice: card.marketPrice,
        quantity: 1
      })
      await removeFromWishlist(card.id)
    } catch (error) {
      console.error('Error moving to collection:', error)
    }
  }

  const getPriorityClass = (priority) => {
    switch (priority) {
      case 'high': return 'priority-high'
      case 'low': return 'priority-low'
      default: return 'priority-medium'
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Wishlist</h1>
        <p>{wishlist.length} cards wanted</p>
      </div>

      <div className="search-container">
        <div className="search-input-wrapper">
          <input
            type="text"
            className="search-input"
            placeholder="Filter wishlist..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      {filteredWishlist.length > 0 ? (
        <div className="cards-grid">
          {filteredWishlist.map(card => (
            <div key={card.id} className="pokemon-card">
              <span className={`priority-badge ${getPriorityClass(card.priority)}`}>
                {card.priority}
              </span>
              <img src={card.imageUrl} alt={card.name} />
              <div className="pokemon-card-info">
                <div className="pokemon-card-name">{card.name}</div>
                <div className="pokemon-card-set">{card.set}</div>
                {card.marketPrice && (
                  <div className="pokemon-card-price">${card.marketPrice.toFixed(2)}</div>
                )}
                {card.notes && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                    {card.notes}
                  </div>
                )}
                <div className="pokemon-card-actions" style={{ flexDirection: 'column' }}>
                  <button
                    className="btn btn-primary btn-sm btn-full"
                    onClick={() => handleMoveToCollection(card)}
                  >
                    Got it! Add to Collection
                  </button>
                  <button
                    className="btn btn-danger btn-sm btn-full"
                    onClick={() => handleRemove(card.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : wishlist.length === 0 ? (
        <div className="empty-state">
          <h3>Your wishlist is empty</h3>
          <p>Search for cards and add them to your wishlist!</p>
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

export default Wishlist
