import type { PrismaClient } from '@prisma/client';
import type { OutboxRegel, OutboxStore } from '../messaging/outbox-relay.js';

export class PrismaOutboxStore implements OutboxStore {
  constructor(private readonly prisma: PrismaClient) {}

  async pakOnverzonden(limiet: number): Promise<OutboxRegel[]> {
    const rijen = await this.prisma.outboxEvent.findMany({
      where: { gepubliceerd: false },
      orderBy: { aangemaaktOp: 'asc' },
      take: limiet,
    });
    return rijen.map((r) => ({ id: r.id, routingKey: r.routingKey, payload: r.payload }));
  }

  async markeerVerzonden(ids: string[]): Promise<void> {
    await this.prisma.outboxEvent.updateMany({
      where: { id: { in: ids } },
      data: { gepubliceerd: true, gepubliceerdOp: new Date() },
    });
  }
}
