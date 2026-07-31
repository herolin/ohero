/// <reference types="vitest/config" />
import { defineConfig } from 'vite';


// Build fingerprint compiled into the bundle: it is what tells a copy of
// this build apart from someone's own similar game. Date only, not a full
// timestamp, so rebuilding on the same day does not churn the published files.
const BUILD_ID = new Date().toISOString().slice(0, 10);

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  // Use a relative base so the static build works under any sub-path
  // (e.g. GitHub Pages project sites served from /game1-bomb/).
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
