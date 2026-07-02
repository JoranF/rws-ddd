import type { FastifyInstance } from 'fastify';
import type { PubliceerAanbesteding } from '../../application/aanbesteding/publiceer-aanbesteding.js';
import type { OntvangInschrijving } from '../../application/aanbesteding/ontvang-inschrijving.js';
import type { GunAanbesteding } from '../../application/aanbesteding/gun-aanbesteding.js';
import type { AanbestedingRepository } from '../../application/ports.js';
import { haalAanbesteding, zoekAanbestedingen } from '../../application/queries.js';
import { naarHttpFout } from './fout-afhandeling.js';

export interface AanbestedingRouteDeps {
  publiceer: PubliceerAanbesteding;
  ontvangInschrijving: OntvangInschrijving;
  gun: GunAanbesteding;
  repo: AanbestedingRepository;
}

export function registreerAanbestedingRoutes(app: FastifyInstance, deps: AanbestedingRouteDeps): void {
  app.post('/api/aanbestedingen', {
    schema: {
      body: {
        type: 'object',
        required: ['kunstwerkId', 'sluitingsdatum', 'prijsgewicht', 'kwaliteitsgewicht'],
        properties: {
          kunstwerkId: { type: 'string' },
          sluitingsdatum: { type: 'string' },
          prijsgewicht: { type: 'number' },
          kwaliteitsgewicht: { type: 'number' },
        },
      },
    },
  }, async (req, reply) => {
    try {
      const resultaat = await deps.publiceer.uitvoeren(req.body as never);
      reply.code(201).send(resultaat);
    } catch (fout) {
      const { code, body } = naarHttpFout(fout);
      reply.code(code).send(body);
    }
  });

  app.post('/api/aanbestedingen/:id/inschrijvingen', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await deps.ontvangInschrijving.uitvoeren({ aanbestedingId: id, ...(req.body as object) } as never);
      reply.code(202).send({ status: 'ontvangen' });
    } catch (fout) {
      const { code, body } = naarHttpFout(fout);
      reply.code(code).send(body);
    }
  });

  app.post('/api/aanbestedingen/:id/gunning', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const resultaat = await deps.gun.uitvoeren({ aanbestedingId: id, ...(req.body as object) } as never);
      reply.code(201).send(resultaat);
    } catch (fout) {
      const { code, body } = naarHttpFout(fout);
      reply.code(code).send(body);
    }
  });

  app.get('/api/aanbestedingen', async (_req, reply) => {
    reply.send(await zoekAanbestedingen(deps.repo));
  });

  app.get('/api/aanbestedingen/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const weergave = await haalAanbesteding(deps.repo, id);
    if (!weergave) { reply.code(404).send({ fout: 'niet gevonden' }); return; }
    reply.send(weergave);
  });
}
