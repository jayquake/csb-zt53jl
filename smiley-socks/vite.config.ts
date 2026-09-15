// vitest/config re-exports Vite's defineConfig with the `test` block typed,
// so one config file serves both the dev server and the test runner.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset URLs. The site is served from a subpath on GitHub Pages
  // (/csb-zt53jl/smiley-socks/), and absolute "/assets/..." URLs would resolve
  // against the domain root and 404 there. This also makes the built dist/
  // openable straight off the filesystem.
  base: './',
  build: { outDir: 'dist', assetsDir: 'assets' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
