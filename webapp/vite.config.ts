import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * The build output goes to `public/`, which is what Signal K serves for a
 * webapp package, so the app ends up at `/lcars-helm` on the server. Vite's own
 * static-asset directory is moved to `static/` to keep it out of the way.
 *
 * During development the app runs on Vite's server and proxies everything under
 * `/signalk` — REST and the delta WebSocket — through to a Signal K server on
 * this machine, so the code is identical in both settings.
 */
export default defineConfig({
  plugins: [react()],
  base: './',
  publicDir: 'static',
  build: {
    outDir: 'public',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true
  },
  server: {
    port: 5173,
    proxy: {
      '/signalk': {
        target: process.env.LCARS_SIGNALK_URL ?? 'http://localhost:3000',
        changeOrigin: true,
        ws: true
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true
  }
})
