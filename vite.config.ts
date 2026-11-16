/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

// Vite 5 leaves emitted worker bundles out of build.manifest, and sw.js precaches from that manifest.
const workerChunksInManifest = (): Plugin => ({
  name: 'worker-chunks-in-manifest',
  apply: 'build',
  writeBundle(opts, bundle) {
    const file = join(opts.dir ?? 'dist', '.vite/manifest.json')
    const manifest = JSON.parse(readFileSync(file, 'utf8'))
    for (const name of Object.keys(bundle)) {
      if (/\/[^/]*\.worker-[^/]*\.js$/.test(name)) manifest[name] = { file: name, isEntry: true }
    }
    const json = JSON.stringify(manifest, null, 2)
    writeFileSync(file, json)
    // Without a per-build stamp sw.js stays byte-identical, so browsers never re-run install on a new release.
    const sw = join(opts.dir ?? 'dist', 'sw.js')
    writeFileSync(sw, readFileSync(sw, 'utf8').replaceAll('__BUILD__', createHash('sha256').update(json).digest('hex').slice(0, 12)))
  },
})

export default defineConfig({
  plugins: [react(), workerChunksInManifest()],
  build: { manifest: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
