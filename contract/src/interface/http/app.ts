import Fastify, { type FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { registreerHealthRoute, type HealthChecks } from './health-route.js';
import { registreerAanbestedingRoutes, type AanbestedingRouteDeps } from './aanbesteding-routes.js';
import { registreerContractRoutes, type ContractRouteDeps } from './contract-routes.js';

export interface AppDeps {
  health?: HealthChecks;
  aanbesteding?: AanbestedingRouteDeps;
  contract?: ContractRouteDeps;
}

export async function bouwApp(deps: AppDeps = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  await app.register(swagger, {
    openapi: { info: { title: 'Contract-service', version: '0.1.0' } },
  });
  await app.register(swaggerUi, { routePrefix: '/api/docs' });

  registreerHealthRoute(app, deps.health);
  if (deps.aanbesteding) registreerAanbestedingRoutes(app, deps.aanbesteding);
  if (deps.contract) registreerContractRoutes(app, deps.contract);
  return app;
}
