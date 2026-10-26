/// <reference types="vitest/config" />
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  build: {
    // The ECharts chunk (~600 KB raw, 200 KB gzipped) is already modular and loads on first chart
    // mount (EChart.tsx); the JS budget is gzipped size (ARCHITECTURE §7), checked in PROGRESS.
    chunkSizeWarningLimit: 650,
  },
  server: {
    port: 5173,
    // Same-origin in dev too: the FastAPI app serves /api (ADR-0002), so no CORS is needed.
    // API_PROXY_TARGET lets the docker-compose dev profile point at the api-dev container.
    proxy: { '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:8000' },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
