import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The app reads the contract addresses from ../deployments at build time.
  server: { fs: { allow: ['..'] } },
  build: { target: 'es2020', chunkSizeWarningLimit: 2000 },
});
