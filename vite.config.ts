import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// L'app sta in app/ e la build esce in app/dist (pages_build_output_dir di
// wrangler.toml). In sviluppo /api va al backend di `npm run dev:api`.
export default defineConfig({
  root: 'app',
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:8788' } },
  build: { outDir: 'dist', emptyOutDir: true },
})
