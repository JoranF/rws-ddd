import type { FastifyInstance } from 'fastify';
import type { KeurWijzigingGoed } from '../../application/onderhoudscontract/keur-wijziging-goed.js';
import type { StelPrestatieverklaringOp } from '../../application/onderhoudscontract/stel-prestatieverklaring-op.js';
import type { RondOnderhoudscontractAf } from '../../application/onderhoudscontract/rond-onderhoudscontract-af.js';
import type { OnderhoudscontractRepository } from '../../application/ports.js';
import { haalContract, zoekContracten, zoekContractenPerKunstwerk } from '../../application/queries.js';
import { naarHttpFout } from './fout-afhandeling.js';

export interface ContractRouteDeps {
  keurWijziging: KeurWijzigingGoed;
  stelPrestatie: StelPrestatieverklaringOp;
  rondAf: RondOnderhoudscontractAf;
  repo: OnderhoudscontractRepository;
}

export function registreerContractRoutes(app: FastifyInstance, deps: ContractRouteDeps): void {
  app.post('/api/contracten/:id/wijzigingen', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await deps.keurWijziging.uitvoeren({ contractId: id, ...(req.body as object) } as never);
      reply.code(201).send({ status: 'goedgekeurd' });
    } catch (fout) { const { code, body } = naarHttpFout(fout); reply.code(code).send(body); }
  });

  app.post('/api/contracten/:id/prestatieverklaringen', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await deps.stelPrestatie.uitvoeren({ contractId: id, ...(req.body as object) } as never);
      reply.code(201).send({ status: 'opgesteld' });
    } catch (fout) { const { code, body } = naarHttpFout(fout); reply.code(code).send(body); }
  });

  app.post('/api/contracten/:id/afronding', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await deps.rondAf.uitvoeren({ contractId: id, ...(req.body as object) } as never);
      reply.code(200).send({ status: 'afgerond' });
    } catch (fout) { const { code, body } = naarHttpFout(fout); reply.code(code).send(body); }
  });

  app.get('/api/contracten', async (req, reply) => {
    const { kunstwerkId } = req.query as { kunstwerkId?: string };
    if (kunstwerkId) { reply.send(await zoekContractenPerKunstwerk(deps.repo, kunstwerkId)); return; }
    reply.send(await zoekContracten(deps.repo));
  });

  app.get('/api/contracten/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const weergave = await haalContract(deps.repo, id);
    if (!weergave) { reply.code(404).send({ fout: 'niet gevonden' }); return; }
    reply.send(weergave);
  });
}
