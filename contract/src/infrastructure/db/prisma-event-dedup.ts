import type { PrismaClient } from '@prisma/client';
import type { EventDedup } from '../messaging/beheer-kunstwerk-consumer.js';

/**
 * Gedeelde idempotentie-poort: alle consumers dedupliceren op de globaal-unieke
 * `eventId` via dezelfde `VerwerktEvent`-tabel.
 */
export class PrismaEventDedup implements EventDedup {
  constructor(private readonly prisma: PrismaClient) {}

  async isVerwerkt(eventId: string): Promise<boolean> {
    return (await this.prisma.verwerktEvent.findUnique({ where: { eventId } })) !== null;
  }
  async markeerVerwerkt(eventId: string): Promise<void> {
    await this.prisma.verwerktEvent.create({ data: { eventId } });
  }
}
