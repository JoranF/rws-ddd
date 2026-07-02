import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// De services sturen GEEN CORS-headers. Alle fetches gaan naar relatieve paden
// (/contract, /monitoring, /onderhoud, /beheer); deze dev-proxy stuurt ze door
// naar de lokaal draaiende services. In Docker/Dokploy doet nginx exact hetzelfde,
// dus de frontend-code merkt het verschil niet.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/contract':   { target: 'http://127.0.0.1:8001', changeOrigin: true, rewrite: p => p.replace(/^\/contract/, '') },
      '/monitoring': { target: 'http://127.0.0.1:8002', changeOrigin: true, rewrite: p => p.replace(/^\/monitoring/, '') },
      '/onderhoud':  { target: 'http://127.0.0.1:8003', changeOrigin: true, rewrite: p => p.replace(/^\/onderhoud/, '') },
      '/beheer':     { target: 'http://127.0.0.1:8004', changeOrigin: true, rewrite: p => p.replace(/^\/beheer/, '') },
    },
  },
});
