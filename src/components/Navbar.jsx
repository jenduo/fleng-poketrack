import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/collection', label: 'Collection' },
  { to: '/binder', label: 'Binder' },
  {
    to: '/binder-beta',
    label: (
      <>
        Playground <span className="beta-badge">[beta]</span>
      </>
    )
  },
]

function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar-content">
        <NavLink to="/" className="navbar-brand">
          <img src="/fleng-poketrack/pokeball.svg" alt="" />
          PokeTrack
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
