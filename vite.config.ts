/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // A new version activates on the next load; the timer survives reloads, so nothing is lost.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Epoch',
        short_name: 'Epoch',
        description: 'A Pomodoro study timer with stats. Works offline; your history stays on your device.',
        lang: 'en',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        theme_color: '#010102',
        background_color: '#010102',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything the app needs offline, chimes and fonts included.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wav}'],
        importScripts: ['notification-click.js'],
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
