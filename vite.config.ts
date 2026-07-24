/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
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
