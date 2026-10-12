import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFile } from 'node:fs/promises'

export default defineConfig({
  server: {
    host: '127.0.0.1',
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    },
  },
  preview: {
    host: '127.0.0.1',
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    },
  },
  plugins: [
    react(),
    {
      name: 'spa-not-found-fallback',
      apply: 'build',
      async closeBundle() {
        await copyFile('dist/index.html', 'dist/404.html')
      },
    },
  ],
  build: { sourcemap: false },
})
