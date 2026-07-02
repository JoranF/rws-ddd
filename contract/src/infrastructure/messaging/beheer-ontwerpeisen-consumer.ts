import type { RabbitMqConnectie } from './rabbitmq-connectie.js';
import { RWS_EXCHANGE } from './rabbitmq-connectie.js';
import type { EventDedup } from './beheer-kunstwerk-consumer.js';

export interface OntwerpeisStore {
  bewaarEisen(kunstwerkId: string, eisen: unknown): Promise<void>;
}

interface Envelope { eventId: string; eventType: string; data: Record<string, unknown> }

/**
 * Consumer voor `beheer.ontwerpeisen.vastgesteld` (Beheer = customer/supplier).
 * Vertaalt aan de rand naar het lokale ontwerpeisen-read-model. Idempotent op eventId.
 */
export class BeheerOntwerpeisenVerwerker {
  constructor(private readonly store: OntwerpeisStore, private readonly dedup: EventDedup) {}

  async verwerk(env: Envelope): Promise<void> {
    if (await this.dedup.isVerwerkt(env.eventId)) return;
    const kunstwerkId = String(env.data.kunstwerkId ?? '');
    if (kunstwerkId === '') return;
    if (env.eventType === 'beheer.ontwerpeisen.vastgesteld') {
      await this.store.bewaarEisen(kunstwerkId, env.data.eisen ?? {});
    }
    await this.dedup.markeerVerwerkt(env.eventId);
  }
}

const QUEUE = 'contract.beheer-ontwerpeisen';

export async function startOntwerpeisenConsumer(connectie: RabbitMqConnectie, verwerker: BeheerOntwerpeisenVerwerker): Promise<void> {
  const kanaal = connectie.kanaal;
  await kanaal.assertQueue(QUEUE, { durable: true });
  await kanaal.bindQueue(QUEUE, RWS_EXCHANGE, 'beheer.ontwerpeisen.vastgesteld');
  await kanaal.consume(QUEUE, async (bericht) => {
    if (!bericht) return;
    try {
      await verwerker.verwerk(JSON.parse(bericht.content.toString()));
      kanaal.ack(bericht);
    } catch {
      kanaal.nack(bericht, false, false);
    }
  });
}
