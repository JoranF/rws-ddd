import type { Envelope, EventDedup } from './consumer-helpers';

export interface BeheerStore {
  upsertKunstwerk(kunstwerkId: string, type: string | null, locatie: string | null): Promise<void>;
  markeerBuitenGebruik(kunstwerkId: string): Promise<void>;
  bewaarEisen(kunstwerkId: string, eisen: unknown): Promise<void>;
}

export class BeheerVerwerker {
  constructor(
    private readonly store: BeheerStore,
    private readonly dedup: EventDedup,
  ) {}

  async verwerk(env: Envelope): Promise<void> {
    if (await this.dedup.isVerwerkt(env.eventId)) return;
    const kunstwerkId = String(env.data.kunstwerkId ?? '');
    if (kunstwerkId === '') return;
    if (env.eventType === 'beheer.kunstwerk.geregistreerd') {
      await this.store.upsertKunstwerk(kunstwerkId, (env.data.type as string) ?? null, (env.data.locatie as string) ?? null);
    } else if (env.eventType === 'beheer.kunstwerk.buitengebruikgesteld') {
      await this.store.markeerBuitenGebruik(kunstwerkId);
    } else if (env.eventType === 'beheer.onderhoudseisen.vastgesteld') {
      await this.store.bewaarEisen(kunstwerkId, env.data.eisen ?? []);
    }
    await this.dedup.markeerVerwerkt(env.eventId);
  }
}

export const BEHEER_QUEUE = 'onderhoud.beheer';
export const BEHEER_BINDINGS = ['beheer.kunstwerk.*', 'beheer.onderhoudseisen.vastgesteld'];
