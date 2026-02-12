import { useCollection } from '../hooks/useCollection'
import { useWishlist } from '../hooks/useWishlist'
import { Link } from 'react-router-dom'

function Dashboard() {
  const { cards, loading: collectionLoading, getTotalValue, getTotalCards } = useCollection()
  const { wishlist, loading: wishlistLoading } = useWishlist()

  if (collectionLoading || wishlistLoading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
      </div>
    )
  }

  const totalValue = getTotalValue()
  const totalCards = getTotalCards()
  const uniqueSets = new Set(cards.map(card => card.set)).size
  const recentCards = cards.slice(0, 6)

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Overview of your Pokemon card collection</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-label">Total Cards</div>
          <div className="stat-card-value">{totalCards}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Unique Cards</div>
          <div className="stat-card-value">{cards.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Sets Collected</div>
          <div className="stat-card-value">{uniqueSets}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Collection Value</div>
          <div className="stat-card-value money">${totalValue.toFixed(2)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Wishlist Items</div>
          <div className="stat-card-value">{wishlist.length}</div>
        </div>
      </div>

      <div className="page-header">
        <h2>Recent Additions</h2>
      </div>

      {recentCards.length > 0 ? (
        <>
          <div className="cards-grid">
            {recentCards.map(card => (
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
                </div>
              </div>
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
          <h3>No cards yet!</h3>
          <p>Start building your collection by searching for cards.</p>
          <Link to="/search" className="btn btn-primary">
            Search Cards
          </Link>
        </div>
      )}
    </div>
  )
}

export default Dashboard
