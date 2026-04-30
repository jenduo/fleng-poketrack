import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BASE = '/fleng-poketrack'

// Redirect bare /fleng-poketrack (no trailing slash) → /fleng-poketrack/
// in dev. Without this Vite returns 404 for the unsuffixed URL.
const baseRedirect = () => ({
  name: 'base-trailing-slash-redirect',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === BASE) {
        res.writeHead(301, { Location: BASE + '/' })
        res.end()
        return
      }
      next()
    })
  }
})

export default defineConfig({
  plugins: [react(), baseRedirect()],
  base: BASE + '/',
  server: {
    proxy: {
      '/api/collectr': {
        target: 'https://api-v2.getcollectr.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/collectr/, ''),
        headers: {
          'origin': 'https://app.getcollectr.com',
          'referer': 'https://app.getcollectr.com/',
        }
      }
    }
  }
})
