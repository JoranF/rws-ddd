import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// De services sturen GEEN CORS-headers. Alle fetches gaan naar relatieve paden onder
// /svc/ (/svc/contract, /svc/monitoring, ...); deze dev-proxy stuurt ze door naar de
// lokaal draaiende services. In Docker/Dokploy doet nginx exact hetzelfde, dus de
// frontend-code merkt het verschil niet. De /svc-prefix is nodig omdat de SPA-routes
// zelf /beheer, /monitoring, enz. heten — zonder prefix kaapt de proxy een harde
// refresh op die routes.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/svc/contract':   { target: 'http://127.0.0.1:8001', changeOrigin: true, rewrite: p => p.replace(/^\/svc\/contract/, '') },
      '/svc/monitoring': { target: 'http://127.0.0.1:8002', changeOrigin: true, rewrite: p => p.replace(/^\/svc\/monitoring/, '') },
      '/svc/onderhoud':  { target: 'http://127.0.0.1:8003', changeOrigin: true, rewrite: p => p.replace(/^\/svc\/onderhoud/, '') },
      '/svc/beheer':     { target: 'http://127.0.0.1:8004', changeOrigin: true, rewrite: p => p.replace(/^\/svc\/beheer/, '') },
    },
  },
});
