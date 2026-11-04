import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const SERVER = process.env.VITE_DEV_SERVER ?? 'http://localhost:3001';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/socket.io': { target: SERVER, ws: true, changeOrigin: true },
      '/health': { target: SERVER },
    },
  },
});
