import { v4 as uuid } from 'uuid';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { EventPublisher } from '../../application/ports.js';
import type { ContractDomainEvent } from '../../domain/gedeeld/domain-events.js';
import { maakEnvelope } from '../messaging/rabbitmq-event-publisher.js';

/**
 * Fase 2 — transactionele outbox: i.p.v. direct op de broker publiceren, schrijven we
 * het event (met vaste envelope) durabel weg in de `OutboxEvent`-tabel. Een aparte relay
 * bezorgt het daarna op `rws.events`. Zo gaat een event niet verloren als de broker even
 * onbereikbaar is (publish-na-commit → outbox).
 */
export class PrismaOutboxEventPublisher implements EventPublisher {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly nieuwId: () => string = uuid,
    private readonly nu: () => Date = () => new Date(),
  ) {}

  async publiceer(events: ContractDomainEvent[]): Promise<void> {
    if (events.length === 0) return;
    const rijen = events.map((event) => {
      const envelope = maakEnvelope(event, this.nieuwId, this.nu);
      return {
        id: envelope.eventId,
        eventType: envelope.eventType,
        routingKey: envelope.eventType,
        payload: envelope as unknown as Prisma.InputJsonValue,
      };
    });
    await this.prisma.outboxEvent.createMany({ data: rijen });
  }
}
