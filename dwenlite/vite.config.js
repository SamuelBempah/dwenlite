import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['react.png', 'vite.svg'],
      manifest: {
        name: 'DwenLite',
        short_name: 'DwenLite',
        description: 'Interactive AI teacher for generating notes, quizzes, and flashcards.',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'react.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'react.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5000000 // 5 MiB
      }
    })
  ],
})
