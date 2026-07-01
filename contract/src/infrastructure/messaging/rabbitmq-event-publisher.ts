import { v4 as uuid } from 'uuid';
import type { EventPublisher } from '../../application/ports.js';
import type { ContractDomainEvent } from '../../domain/gedeeld/domain-events.js';
import { RWS_EXCHANGE } from './rabbitmq-connectie.js';

export interface KanaalPublish {
  publish(exchange: string, routingKey: string, content: Buffer, opties?: { persistent?: boolean }): boolean;
}

export class RabbitMqEventPublisher implements EventPublisher {
  constructor(
    private readonly kanaal: KanaalPublish,
    private readonly nieuwId: () => string = uuid,
    private readonly nu: () => Date = () => new Date(),
  ) {}

  async publiceer(events: ContractDomainEvent[]): Promise<void> {
    for (const event of events) {
      const envelope = {
        eventId: this.nieuwId(),
        eventType: event.eventType,
        occurredAt: this.nu().toISOString(),
        producer: 'contract',
        version: 1,
        data: event.data,
      };
      this.kanaal.publish(RWS_EXCHANGE, event.eventType, Buffer.from(JSON.stringify(envelope)), { persistent: true });
    }
  }
}
