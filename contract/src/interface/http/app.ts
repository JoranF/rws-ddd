import Fastify, { type FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { registreerHealthRoute, type HealthChecks } from './health-route.js';
import { registreerAanbestedingRoutes, type AanbestedingRouteDeps } from './aanbesteding-routes.js';
import { registreerContractRoutes, type ContractRouteDeps } from './contract-routes.js';
import { registreerAuth } from './auth-plugin.js';
import { naarHttpFout } from './fout-afhandeling.js';
import type { AuthConfig } from '../../infrastructure/config.js';

export interface AppDeps {
  health?: HealthChecks;
  aanbesteding?: AanbestedingRouteDeps;
  contract?: ContractRouteDeps;
  /** Auth-config; ontbreekt of ingeschakeld=false => geen auth (huidig gedrag). */
  auth?: AuthConfig;
}

export async function bouwApp(deps: AppDeps = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  await app.register(swagger, {
    openapi: { info: { title: 'Contract-service', version: '0.1.0' } },
  });
  await app.register(swaggerUi, { routePrefix: '/api/docs' });

  // Auth-hook vóór de routes; gooit AuthFout (401/403) die de error-handler mapt.
  if (deps.auth) registreerAuth(app, deps.auth);

  // Vertaalt fouten uit hooks (o.a. AuthFout) naar nette HTTP-statuscodes;
  // de route-handlers vangen hun eigen fouten al af via naarHttpFout.
  app.setErrorHandler((fout, _req, reply) => {
    const { code, body } = naarHttpFout(fout);
    reply.code(code).send(body);
  });

  registreerHealthRoute(app, deps.health);
  if (deps.aanbesteding) registreerAanbestedingRoutes(app, deps.aanbesteding);
  if (deps.contract) registreerContractRoutes(app, deps.contract);
  return app;
}
