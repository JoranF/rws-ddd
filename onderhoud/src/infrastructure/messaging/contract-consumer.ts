import type { Envelope, EventDedup } from './consumer-helpers';

export interface ContractStore {
  upsertGegund(p: { contractId: string; kunstwerkId: string; opdrachtnemer: string; looptijdStart: string | null; looptijdEind: string | null }): Promise<void>;
  markeerAfgerond(contractId: string): Promise<void>;
}

export class ContractVerwerker {
  constructor(
    private readonly store: ContractStore,
    private readonly dedup: EventDedup,
  ) {}

  async verwerk(env: Envelope): Promise<void> {
    if (await this.dedup.isVerwerkt(env.eventId)) return;
    const contractId = String(env.data.contractId ?? '');
    if (contractId === '') return;
    if (env.eventType === 'contract.onderhoudscontract.gegund') {
      const looptijd = (env.data.looptijd ?? {}) as { start?: string; eind?: string };
      await this.store.upsertGegund({
        contractId,
        kunstwerkId: String(env.data.kunstwerkId ?? ''),
        opdrachtnemer: String(env.data.opdrachtnemer ?? ''),
        looptijdStart: looptijd.start ?? null,
        looptijdEind: looptijd.eind ?? null,
      });
    } else if (env.eventType === 'contract.onderhoudscontract.afgerond') {
      await this.store.markeerAfgerond(contractId);
    }
    await this.dedup.markeerVerwerkt(env.eventId);
  }
}

export const CONTRACT_QUEUE = 'onderhoud.contract';
export const CONTRACT_BINDINGS = ['contract.onderhoudscontract.*'];
