import { useState } from 'react'

function Login({ onLogin }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (password === import.meta.env.VITE_APP_PASSWORD) {
      sessionStorage.setItem('authenticated', 'true')
      onLogin()
    } else {
      setError('Incorrect password')
      setPassword('')
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <img src="/fleng-poketrack/pokeball.svg" alt="Pokeball" />
          <h1>PokeTrack</h1>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoFocus
            />
          </div>
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="btn btn-primary btn-full">
            Enter
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login
