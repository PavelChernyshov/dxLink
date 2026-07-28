import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

// Resolve the sibling client packages to their TypeScript source so the conformance suite runs
// against the current code without requiring a prior build of those packages.
const src = (pkg: string): string =>
  fileURLToPath(new URL(`../${pkg}/src/index.ts`, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@dxfeed/dxlink-client-v2': src('dxlink-client-v2'),
      '@dxfeed/dxlink-client-ws-v2': src('dxlink-client-ws-v2'),
      '@dxfeed/dxlink-client-http-v2': src('dxlink-client-http-v2'),
    },
  },
})
