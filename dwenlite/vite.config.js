import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['pwa-192x192.png', 'pwa-512x512.png', 'pwa-512x512-maskable.png', 'vite.svg'],
      manifest: {
        name: 'DwenLite',
        short_name: 'DwenLite',
        description: 'Interactive AI teacher for generating notes, quizzes, and flashcards.',
        theme_color: '#1f2937',
        background_color: '#1f2937',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5000000, // 5 MiB
        importScripts: ['push-sw.js'] // notifications from Dwenlite Home
      },
      devOptions: {
        enabled: true,
        type: 'module',
      }
    })
  ],
})
