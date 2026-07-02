import type { FastifyInstance } from 'fastify';

export interface HealthChecks {
  db?: () => Promise<boolean>;
  broker?: () => Promise<boolean>;
}

export function registreerHealthRoute(app: FastifyInstance, checks: HealthChecks = {}): void {
  app.get('/health', async (_req, reply) => {
    const db = checks.db ? await checks.db().catch(() => false) : true;
    const broker = checks.broker ? await checks.broker().catch(() => false) : true;
    const gezond = db && broker;
    reply.code(gezond ? 200 : 503).send({ status: gezond ? 'ok' : 'degraded', db, broker });
  });
}
