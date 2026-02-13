import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/fleng-poketrack/',
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
