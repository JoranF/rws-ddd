import { Prisma, type PrismaClient } from '@prisma/client';
import type { OntwerpeisStore } from '../messaging/beheer-ontwerpeisen-consumer.js';

export class PrismaOntwerpeisenReadModel implements OntwerpeisStore {
  constructor(private readonly prisma: PrismaClient) {}

  async bewaarEisen(kunstwerkId: string, eisen: unknown): Promise<void> {
    const waarde = eisen as Prisma.InputJsonValue;
    await this.prisma.ontwerpeis.upsert({
      where: { kunstwerkId },
      create: { kunstwerkId, eisen: waarde },
      update: { eisen: waarde },
    });
  }

  async haalEisen(kunstwerkId: string): Promise<unknown | null> {
    const rij = await this.prisma.ontwerpeis.findUnique({ where: { kunstwerkId } });
    return rij?.eisen ?? null;
  }
}
