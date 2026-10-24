import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Source lives in web/, build output lands in public/ — that is the
// directory both server.ts (findPublicDir) and snapshot.ts (buildStaticSite)
// already treat as "the UI", so nothing downstream needs to change.
const rootDir = import.meta.dirname;

export default defineConfig({
  root: path.resolve(rootDir, 'web'),
  // Relative, not '/': this is published at jayquake.github.io/csb-zt53jl/
  // (a project page, not a domain root), and also served locally by
  // server.ts at '/'. An absolute base would 404 every asset on Pages while
  // looking fine in local dev, which is exactly the trap this avoids.
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'web/src'),
    },
  },
  build: {
    outDir: path.resolve(rootDir, 'public'),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      // Local dev: `npm run web:dev` serves the UI with HMR, the backend
      // keeps running on its own port (see src/server.ts), and this proxy
      // makes the two look like one origin to the browser.
      '/api': 'http://localhost:8080',
    },
  },
});
