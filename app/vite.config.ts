import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Dev: `npm run dev` proxies /api to the desk server (npm run desk, port 4317).
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1800, target: 'es2022' },
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:4317' } },
  test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}'] },
});
