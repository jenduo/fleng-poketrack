import { NavLink } from 'react-router-dom'

function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar-content">
        <NavLink to="/" className="navbar-brand">
          <img src="/fleng-poketrack/pokeball.svg" alt="PokeTrack" />
          PokeTrack
        </NavLink>
        <div className="navbar-links">
          <NavLink to="/" className={({ isActive }) => isActive ? 'active' : ''} end>
            Dashboard
          </NavLink>
          <NavLink to="/collection" className={({ isActive }) => isActive ? 'active' : ''}>
            Collection
          </NavLink>
          <NavLink to="/wishlist" className={({ isActive }) => isActive ? 'active' : ''}>
            Wishlist
          </NavLink>
          <NavLink to="/search" className={({ isActive }) => isActive ? 'active' : ''}>
            Search
          </NavLink>
        </div>
      </div>
    </nav>
  )
}

export default Navbar
