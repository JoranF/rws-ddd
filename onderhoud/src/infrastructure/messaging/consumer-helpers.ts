import type { RabbitMqConnectie } from './rabbitmq-connectie';
import { RWS_EXCHANGE } from './rabbitmq-connectie';

export interface Envelope {
  eventId: string;
  eventType: string;
  data: Record<string, unknown>;
}

export interface EventDedup {
  isVerwerkt(eventId: string): Promise<boolean>;
  markeerVerwerkt(eventId: string): Promise<void>;
}

export async function startConsumer(
  connectie: RabbitMqConnectie,
  queue: string,
  bindings: string[],
  verwerk: (env: Envelope) => Promise<void>,
): Promise<void> {
  const kanaal = connectie.kanaal;
  await kanaal.assertQueue(queue, { durable: true });
  for (const binding of bindings) {
    await kanaal.bindQueue(queue, RWS_EXCHANGE, binding);
  }
  await kanaal.consume(queue, async (bericht) => {
    if (!bericht) return;
    try {
      await verwerk(JSON.parse(bericht.content.toString()));
      kanaal.ack(bericht);
    } catch {
      kanaal.nack(bericht, false, false);
    }
  });
}
