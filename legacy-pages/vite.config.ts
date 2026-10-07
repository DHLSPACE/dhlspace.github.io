import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/legacy-assets/',
  publicDir: false,
  build: {
    outDir: '../public/legacy-assets',
    emptyOutDir: true,
  },
})
