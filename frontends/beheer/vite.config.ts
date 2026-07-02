import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/contract': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/contract/, ''),
      },
      '/monitoring': {
        target: 'http://127.0.0.1:8002',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/monitoring/, ''),
      },
      '/onderhoud': {
        target: 'http://127.0.0.1:8003',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/onderhoud/, ''),
      },
      '/beheer': {
        target: 'http://127.0.0.1:8004',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/beheer/, ''),
      },
    },
  },
});
