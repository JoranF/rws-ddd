import type { PrismaClient } from '@prisma/client';
import type { OnderhoudscontractRepository } from '../../application/ports.js';
import { Onderhoudscontract, type ContractStatus } from '../../domain/onderhoudscontract/onderhoudscontract.js';
import { AanbestedingId, Aannemer, Bedrag, Contractperiode, ContractId, KunstwerkId } from '../../domain/gedeeld/waarden.js';
import type { Wijziging, WijzigingSoort } from '../../domain/onderhoudscontract/wijziging.js';
import type { Prestatieverklaring } from '../../domain/onderhoudscontract/prestatieverklaring.js';

export class PrismaOnderhoudscontractRepository implements OnderhoudscontractRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async bewaar(c: Onderhoudscontract): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.onderhoudscontract.upsert({
        where: { id: c.id.waarde },
        create: {
          id: c.id.waarde,
          kunstwerkId: c.kunstwerkId.waarde,
          opdrachtnemer: c.opdrachtnemerNaam,
          looptijdStart: c.looptijd.start,
          looptijdEind: c.looptijd.eind,
          waardeCenten: c.waarde.centen,
          aanbestedingId: c.aanbestedingIdWaarde,
          status: c.status,
        },
        update: { waardeCenten: c.waarde.centen, status: c.status },
      }),
      this.prisma.wijziging.deleteMany({ where: { contractId: c.id.waarde } }),
      this.prisma.wijziging.createMany({
        data: c.wijzigingenLijst.map((w) => ({
          id: w.id, contractId: c.id.waarde, mutatieCenten: w.mutatie.centen, soort: w.soort, reden: w.reden, datum: w.datum,
        })),
      }),
      this.prisma.prestatieverklaring.deleteMany({ where: { contractId: c.id.waarde } }),
      this.prisma.prestatieverklaring.createMany({
        data: c.prestatiesLijst.map((p) => ({
          id: p.id, contractId: c.id.waarde, periodeStart: p.periode.start, periodeEind: p.periode.eind, score: p.score, bedragCenten: p.bedrag.centen,
        })),
      }),
    ]);
  }

  async zoek(id: ContractId): Promise<Onderhoudscontract | null> {
    const rij = await this.prisma.onderhoudscontract.findUnique({ where: { id: id.waarde }, include: { wijzigingen: true, prestaties: true } });
    if (!rij) return null;
    const wijzigingen: Wijziging[] = rij.wijzigingen.map((w) => ({
      id: w.id, mutatie: Bedrag.vanCenten(w.mutatieCenten), soort: w.soort as WijzigingSoort, reden: w.reden, datum: w.datum,
    }));
    const prestaties: Prestatieverklaring[] = rij.prestaties.map((p) => ({
      id: p.id, periode: Contractperiode.van(p.periodeStart, p.periodeEind), score: p.score, bedrag: Bedrag.vanCenten(p.bedragCenten),
    }));
    return Onderhoudscontract.herstel({
      id: ContractId.van(rij.id),
      kunstwerkId: KunstwerkId.van(rij.kunstwerkId),
      opdrachtnemer: Aannemer.van(rij.opdrachtnemer),
      looptijd: Contractperiode.van(rij.looptijdStart, rij.looptijdEind),
      waarde: Bedrag.vanCenten(rij.waardeCenten),
      aanbestedingId: rij.aanbestedingId ? AanbestedingId.van(rij.aanbestedingId) : undefined,
      status: rij.status as ContractStatus,
      wijzigingen,
      prestatieverklaringen: prestaties,
    });
  }

  async zoekAlle(): Promise<Onderhoudscontract[]> {
    const rijen = await this.prisma.onderhoudscontract.findMany();
    return Promise.all(rijen.map((r) => this.zoek(ContractId.van(r.id)))) as Promise<Onderhoudscontract[]>;
  }

  async zoekPerKunstwerk(kunstwerkId: KunstwerkId): Promise<Onderhoudscontract[]> {
    const rijen = await this.prisma.onderhoudscontract.findMany({ where: { kunstwerkId: kunstwerkId.waarde } });
    return Promise.all(rijen.map((r) => this.zoek(ContractId.van(r.id)))) as Promise<Onderhoudscontract[]>;
  }
}
