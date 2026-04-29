import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: 'Index', end: true },
  { to: '/collection', label: 'Collection' },
  { to: '/binder', label: 'Binder' },
  { to: '/binder-beta', label: 'Binder β' },
  { to: '/wishlist', label: 'Wishlist' },
  { to: '/search', label: 'Search' },
]

function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar-content">
        <NavLink to="/" className="navbar-brand">
          <img src="/fleng-poketrack/pokeball.svg" alt="" />
          poketrack
        </NavLink>
        <div className="navbar-links">
          {links.map(l => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) => isActive ? 'active' : ''}
            >
              {l.label}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  )
}

export default Navbar
