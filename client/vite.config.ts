import { gzipSync } from 'node:zlib'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// 150 KB was the target; the user accepted a slight overrun on 2026-11-09
const ENTRY_BUDGET_GZIP_BYTES = 152 * 1024

/** Fails the build when the code loaded before first paint outgrows the budget. */
function entryBudget(): Plugin {
  return {
    name: 'openfox-entry-budget',
    apply: 'build',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).flatMap((item) => (item.type === 'chunk' ? [item] : []))
      const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]))
      const seen = new Set<string>()
      const visit = (fileName: string) => {
        const chunk = byName.get(fileName)
        if (!chunk || seen.has(fileName)) return
        seen.add(fileName)
        chunk.imports.forEach(visit)
      }
      chunks.filter((chunk) => chunk.isEntry).forEach((chunk) => visit(chunk.fileName))
      const total = [...seen].reduce((sum, name) => sum + gzipSync(byName.get(name)!.code).length, 0)
      this.info(`entry: ${(total / 1024).toFixed(1)} KB gzip`)
      if (total > ENTRY_BUDGET_GZIP_BYTES) {
        this.error(`entry is ${(total / 1024).toFixed(1)} KB gzip, budget is ${ENTRY_BUDGET_GZIP_BYTES / 1024} KB`)
      }
    },
  }
}

const backend = process.env['OPENFOX_BACKEND'] ?? 'http://localhost:10370'

export default defineConfig({
  plugins: [
    react(),
    entryBudget(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'OpenFox',
        short_name: 'OpenFox',
        description: 'Local-LLM-first agentic coding assistant',
        theme_color: '#2e3440',
        background_color: '#2e3440',
        display: 'standalone',
        icons: [
          { src: 'assets/openfox-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'assets/openfox-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        // Only the shell is precached: hundreds of language grammars must not land on a phone up front
        globPatterns: ['index.html', 'assets/index-*.{js,css}', '**/*.{png,svg,ico}'],
        navigateFallbackDenylist: [/^\/api/, /^\/ws/],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/.+\.(?:js|css|woff2)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'openfox-assets', expiration: { maxEntries: 300 } },
          },
        ],
      },
    }),
  ],
  resolve: { alias: { '@shared': path.resolve(__dirname, '../src/shared') } },
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: false },
  server: {
    port: 5198,
    strictPort: true,
    fs: { allow: [path.resolve(__dirname, '..')] },
    proxy: {
      '/api': { target: backend, changeOrigin: true },
      '/ws': { target: backend.replace(/^http/, 'ws'), ws: true },
    },
  },
})
