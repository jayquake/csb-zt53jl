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
