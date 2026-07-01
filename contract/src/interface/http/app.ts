import Fastify, { type FastifyInstance } from 'fastify';
import { registreerHealthRoute, type HealthChecks } from './health-route.js';

export interface AppDeps {
  health?: HealthChecks;
}

export function bouwApp(deps: AppDeps = {}): FastifyInstance {
  const app = Fastify({ logger: true });
  registreerHealthRoute(app, deps.health);
  return app;
}
