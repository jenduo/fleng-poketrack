import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Dashboard from './components/Dashboard'
import Collection from './components/Collection'
import Wishlist from './components/Wishlist'
import CardSearch from './components/CardSearch'

function App() {
  return (
    <div className="app">
      <Navbar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/collection" element={<Collection />} />
          <Route path="/wishlist" element={<Wishlist />} />
          <Route path="/search" element={<CardSearch />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
