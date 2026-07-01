import type { PrismaClient } from '@prisma/client';
import type { KunstwerkenReadModel } from '../../application/ports.js';
import type { KunstwerkId } from '../../domain/gedeeld/waarden.js';
import type { EventDedup, KunstwerkStore } from '../messaging/beheer-kunstwerk-consumer.js';

export class PrismaKunstwerkenReadModel implements KunstwerkenReadModel, KunstwerkStore, EventDedup {
  constructor(private readonly prisma: PrismaClient) {}

  async isBekendEnInGebruik(id: KunstwerkId): Promise<boolean> {
    const rij = await this.prisma.bekendKunstwerk.findUnique({ where: { kunstwerkId: id.waarde } });
    return rij?.inGebruik ?? false;
  }
  async upsert(kunstwerkId: string, type: string | null, locatie: string | null): Promise<void> {
    await this.prisma.bekendKunstwerk.upsert({
      where: { kunstwerkId },
      create: { kunstwerkId, type: type ?? undefined, locatie: locatie ?? undefined, inGebruik: true },
      update: { type: type ?? undefined, locatie: locatie ?? undefined, inGebruik: true },
    });
  }
  async markeerBuitenGebruik(kunstwerkId: string): Promise<void> {
    await this.prisma.bekendKunstwerk.upsert({
      where: { kunstwerkId },
      create: { kunstwerkId, inGebruik: false },
      update: { inGebruik: false },
    });
  }
  async isVerwerkt(eventId: string): Promise<boolean> {
    return (await this.prisma.verwerktEvent.findUnique({ where: { eventId } })) !== null;
  }
  async markeerVerwerkt(eventId: string): Promise<void> {
    await this.prisma.verwerktEvent.create({ data: { eventId } });
  }
}
