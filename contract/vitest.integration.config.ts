import { defineConfig } from 'vitest/config';

// Aparte config voor de zware integratietests (Testcontainers + echte Postgres).
// Draai met `npm run test:integration`. Vereist een draaiende Docker-daemon.
export default defineConfig({
  test: {
    include: ['test/**/*.integration.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
});
