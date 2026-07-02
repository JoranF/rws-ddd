import type { PrismaClient } from '@prisma/client';
import type { AanbestedingRepository } from '../../application/ports.js';
import { Aanbesteding, type AanbestedingStatus } from '../../domain/aanbesteding/aanbesteding.js';
import { Aannemer, AanbestedingId, Bedrag, Gunningscriteria, KunstwerkId } from '../../domain/gedeeld/waarden.js';
import type { Inschrijving } from '../../domain/aanbesteding/inschrijving.js';

export class PrismaAanbestedingRepository implements AanbestedingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async bewaar(a: Aanbesteding): Promise<void> {
    const inschrijvingen = a.inschrijvingen;
    await this.prisma.$transaction([
      this.prisma.aanbesteding.upsert({
        where: { id: a.id.waarde },
        create: {
          id: a.id.waarde,
          kunstwerkId: a.kunstwerkId.waarde,
          sluitingsdatum: a.sluitingsdatum,
          prijsgewicht: a.criteria.prijsgewicht,
          kwaliteitsgewicht: a.criteria.kwaliteitsgewicht,
          status: a.status,
        },
        update: { status: a.status },
      }),
      this.prisma.inschrijving.deleteMany({ where: { aanbestedingId: a.id.waarde } }),
      this.prisma.inschrijving.createMany({
        data: inschrijvingen.map((i) => ({
          id: i.id,
          aanbestedingId: a.id.waarde,
          aannemer: i.aannemer.naam,
          prijsCenten: i.prijs.centen,
          kwaliteitsscore: i.kwaliteitsscore,
        })),
      }),
    ]);
  }

  async zoek(id: AanbestedingId): Promise<Aanbesteding | null> {
    const rij = await this.prisma.aanbesteding.findUnique({ where: { id: id.waarde }, include: { inschrijvingen: true } });
    if (!rij) return null;
    const inschrijvingen: Inschrijving[] = rij.inschrijvingen.map((i) => ({
      id: i.id,
      aannemer: Aannemer.van(i.aannemer),
      prijs: Bedrag.vanCenten(i.prijsCenten),
      kwaliteitsscore: i.kwaliteitsscore,
    }));
    return Aanbesteding.herstel({
      id: AanbestedingId.van(rij.id),
      kunstwerkId: KunstwerkId.van(rij.kunstwerkId),
      sluitingsdatum: rij.sluitingsdatum,
      criteria: Gunningscriteria.van(rij.prijsgewicht, rij.kwaliteitsgewicht),
      status: rij.status as AanbestedingStatus,
      inschrijvingen,
    });
  }

  async zoekAlle(): Promise<Aanbesteding[]> {
    const rijen = await this.prisma.aanbesteding.findMany({ include: { inschrijvingen: true } });
    return Promise.all(rijen.map((r) => this.zoek(AanbestedingId.van(r.id)))) as Promise<Aanbesteding[]>;
  }
}
