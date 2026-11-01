/**
 * Vite + Vitest config.
 * - React + Tailwind v4 plugins
 * - `@/` alias -> src/
 * - Vendor chunks split so the app shell stays small
 * - PWA: installable app + service worker that caches ONLY the app shell (JS/CSS/HTML/icons/fonts).
 *   Supabase API responses are never cached, so no user's data is stored on the device.
 * - BASE_PATH env (set by the GitHub Pages workflow to "/<repo>/") moves the whole app under a
 *   sub-path; locally it is "/".
 */
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

const base = process.env.BASE_PATH ?? '/';

const pwa = VitePWA({
  registerType: 'prompt',
  injectRegister: false,
  includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo-mark.webp'],
  manifest: {
    name: 'Ambria Entertainment — Pricing & Quotations',
    short_name: 'Ambria Ent.',
    description: 'Build entertainment packages, present them to guests and share clear quotations.',
    theme_color: '#14110d',
    background_color: '#fafaf9',
    display: 'standalone',
    orientation: 'any',
    start_url: base,
    scope: base,
    lang: 'en-IN',
    categories: ['business', 'productivity'],
    icons: [
      { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
    // The PDF library (~1.6 MB) loads only when someone downloads a quote — don't precache it.
    // Source images (background PNGs, the logo banner, the icon source) are not used by the app; keep them out of the offline cache.
    globIgnores: ['**/pdfmake-*.js', '**/vfs_fonts-*.js', '**/background.png', '**/background1.png', '**/logo new.png', '**/app-icon.png', '**/demo.png', '**/dashboard image.png', '**/sidebar image.png'],
    navigateFallback: 'index.html',
    cleanupOutdatedCaches: true,
    // Fonts and the PDF library are runtime-cached. Supabase (data, auth, signed image URLs) always goes to the network.
    runtimeCaching: [
      {
        urlPattern: /\/assets\/(pdfmake|vfs_fonts)[^/]*\.js$/,
        handler: 'CacheFirst', // file names are content-hashed
        options: { cacheName: 'export-libs', expiration: { maxEntries: 6 } },
      },
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
        handler: 'StaleWhileRevalidate',
        options: { cacheName: 'google-fonts-css' },
      },
      {
        urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts-files',
          expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
    ],
  },
});

export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), pwa],
  // Dev and preview always on 5174. The lms-proxy ALLOWED_ORIGINS secret must list http://localhost:5174.
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
  // The PDF library is loaded on demand; pre-bundle it so the first "Download PDF" click in dev
  // doesn't trigger a dependency re-optimise (which fails that import and reloads the page).
  optimizeDeps: { include: ['pdfmake/build/pdfmake', 'pdfmake/build/vfs_fonts'] },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('@tanstack')) return 'query';
          if (id.includes('react-router')) return 'router';
          if (id.includes('react')) return 'react';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Form tests type with user-event; on a busy machine 5 s is too tight and they time out at random.
    testTimeout: 20000,
    // Tests never use the developer's real .env — no real Supabase calls, same result on every machine.
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
  },
});
