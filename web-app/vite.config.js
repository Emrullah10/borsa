import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// service-carry ayrı bir Cloudflare route'u istemesin diye panel origin'i üzerinden proxy'lenir.
const carryProxy = { '/carry': 'http://localhost:3104' };

export default defineConfig({
  plugins: [react()],
  server: { port: 5180, proxy: carryProxy },
  preview: {
    port: 5180,
    allowedHosts: ['borsa.emrullahbozkurt.com'],
    proxy: carryProxy,
  },
  resolve: {
    alias: {
      '@api': path.resolve(__dirname, 'src/api'),
      '@features': path.resolve(__dirname, 'src/features'),
      '@layouts': path.resolve(__dirname, 'src/layouts'),
      '@pages': path.resolve(__dirname, 'src/pages'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@store': path.resolve(__dirname, 'src/store'),
      '@styles': path.resolve(__dirname, 'src/styles'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.js'],
  },
});
