import { gzipSync } from 'node:zlib'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const ENTRY_BUDGET_GZIP_BYTES = 150 * 1024

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
  plugins: [react(), entryBudget()],
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
