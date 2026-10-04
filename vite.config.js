import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFile } from 'node:fs/promises'

export default defineConfig({
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
})
