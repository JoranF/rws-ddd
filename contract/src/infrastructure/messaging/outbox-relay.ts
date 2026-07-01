import { RWS_EXCHANGE } from './rabbitmq-connectie.js';
import type { KanaalPublish } from './rabbitmq-event-publisher.js';

export interface OutboxRegel {
  id: string;
  routingKey: string;
  payload: unknown;
}

export interface OutboxStore {
  pakOnverzonden(limiet: number): Promise<OutboxRegel[]>;
  markeerVerzonden(ids: string[]): Promise<void>;
}

/**
 * Fase 2 — transactionele outbox relay: leest onverzonden events uit de outbox en
 * bezorgt ze op `rws.events` met de originele envelope (behoudt `eventId` voor
 * downstream-idempotentie). Draait op een interval; at-least-once bezorging.
 */
export class OutboxRelay {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly store: OutboxStore,
    private readonly kanaal: KanaalPublish,
    private readonly batch = 50,
  ) {}

  async verwerkBatch(): Promise<number> {
    const regels = await this.store.pakOnverzonden(this.batch);
    if (regels.length === 0) return 0;
    const verzonden: string[] = [];
    for (const regel of regels) {
      const ok = this.kanaal.publish(
        RWS_EXCHANGE,
        regel.routingKey,
        Buffer.from(JSON.stringify(regel.payload)),
        { persistent: true },
      );
      if (ok) verzonden.push(regel.id);
    }
    if (verzonden.length > 0) await this.store.markeerVerzonden(verzonden);
    return verzonden.length;
  }

  start(intervalMs = 1000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.verwerkBatch().catch((fout) => console.error('outbox-relay fout', fout));
    }, intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = undefined; }
  }
}
