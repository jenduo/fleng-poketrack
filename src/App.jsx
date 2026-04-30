import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Dashboard from './components/Dashboard'
import Collection from './components/Collection'
import Binder from './components/Binder'
import BinderBeta from './components/BinderBeta'
import CardDetail from './components/CardDetail'
import Login from './components/Login'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(
    sessionStorage.getItem('authenticated') === 'true'
  )

  if (!isAuthenticated) {
    return <Login onLogin={() => setIsAuthenticated(true)} />
  }

  return (
    <div className="app">
      <Navbar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/collection" element={<Collection />} />
          <Route path="/binder" element={<Binder />} />
          <Route path="/binder-beta" element={<BinderBeta />} />
          <Route path="/card/:productId" element={<CardDetail />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
