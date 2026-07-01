import type { RabbitMqConnectie } from './rabbitmq-connectie.js';
import { RWS_EXCHANGE } from './rabbitmq-connectie.js';

export interface KunstwerkStore {
  upsert(kunstwerkId: string, type: string | null, locatie: string | null): Promise<void>;
  markeerBuitenGebruik(kunstwerkId: string): Promise<void>;
}
export interface EventDedup {
  isVerwerkt(eventId: string): Promise<boolean>;
  markeerVerwerkt(eventId: string): Promise<void>;
}
interface Envelope { eventId: string; eventType: string; data: Record<string, unknown> }

export class BeheerKunstwerkVerwerker {
  constructor(private readonly store: KunstwerkStore, private readonly dedup: EventDedup) {}

  async verwerk(env: Envelope): Promise<void> {
    if (await this.dedup.isVerwerkt(env.eventId)) return;
    const kunstwerkId = String(env.data.kunstwerkId ?? '');
    if (kunstwerkId === '') return;
    if (env.eventType === 'beheer.kunstwerk.geregistreerd') {
      await this.store.upsert(kunstwerkId, (env.data.type as string) ?? null, (env.data.locatie as string) ?? null);
    } else if (env.eventType === 'beheer.kunstwerk.buitengebruikgesteld') {
      await this.store.markeerBuitenGebruik(kunstwerkId);
    }
    await this.dedup.markeerVerwerkt(env.eventId);
  }
}

const QUEUE = 'contract.beheer-kunstwerk';

export async function startBeheerConsumer(connectie: RabbitMqConnectie, verwerker: BeheerKunstwerkVerwerker): Promise<void> {
  const kanaal = connectie.kanaal;
  await kanaal.assertQueue(QUEUE, { durable: true });
  await kanaal.bindQueue(QUEUE, RWS_EXCHANGE, 'beheer.kunstwerk.*');
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
