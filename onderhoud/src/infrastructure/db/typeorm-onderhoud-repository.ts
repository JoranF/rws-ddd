import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnderhoudEntity } from './entities/onderhoud.entity';
import { InspectieEntity } from './entities/inspectie.entity';
import { FactuurEntity } from './entities/factuur.entity';
import { Onderhoud, type Aanleiding, type FactuurStatus, type InspectieOordeel, type OnderhoudStatus } from '../../domain/onderhoud/onderhoud';
import { AannemerId, Bedrag, ContractId, ernstVan, FactuurId, IncidentId, InspectieId, KunstwerkId, OnderhoudId, StoringId } from '../../domain/gedeeld/waarden';
import type { OnderhoudRepository } from '../../domain/repositories';

export function onderhoudNaarEntity(o: Onderhoud): OnderhoudEntity {
  const e = new OnderhoudEntity();
  e.onderhoudId = o.id.waarde;
  e.kunstwerkId = o.kunstwerkId.waarde;
  e.status = o.status;
  const aanleiding = o.aanleiding;
  e.aanleidingSoort = aanleiding.soort;
  e.storingId = aanleiding.soort === 'Storing' ? aanleiding.storingId.waarde : null;
  e.incidentId = aanleiding.soort === 'Diagnose' ? aanleiding.diagnose.incidentId?.waarde ?? null : null;
  e.bevinding = aanleiding.soort === 'Diagnose' ? aanleiding.diagnose.bevinding : null;
  e.ernst = aanleiding.soort === 'Diagnose' ? aanleiding.diagnose.ernst : null;
  e.contractId = o.contractId?.waarde ?? null;
  e.aannemerId = o.aannemerId?.waarde ?? null;
  e.gestartOp = o.gestartOp ?? null;
  e.afgerondOp = o.afgerondOp ?? null;
  e.resultaat = o.resultaat ?? null;
  e.inspecties = o.inspecties.map((i) => {
    const ie = new InspectieEntity();
    ie.inspectieId = i.id.waarde;
    ie.onderhoudId = o.id.waarde;
    ie.datum = i.datum;
    ie.oordeel = i.oordeel;
    ie.opmerkingen = i.opmerkingen ?? null;
    return ie;
  });
  e.facturen = o.facturen.map((f) => {
    const fe = new FactuurEntity();
    fe.factuurId = f.id.waarde;
    fe.onderhoudId = o.id.waarde;
    fe.bedragCenten = f.bedrag.centen;
    fe.valuta = f.bedrag.valuta;
    fe.status = f.status;
    fe.ontvangenOp = f.ontvangenOp;
    return fe;
  });
  return e;
}

export function entityNaarOnderhoud(e: OnderhoudEntity): Onderhoud {
  const aanleiding: Aanleiding =
    e.aanleidingSoort === 'Storing'
      ? { soort: 'Storing', storingId: StoringId.van(e.storingId ?? '') }
      : {
          soort: 'Diagnose',
          diagnose: {
            incidentId: e.incidentId ? IncidentId.van(e.incidentId) : undefined,
            bevinding: e.bevinding ?? '',
            ernst: ernstVan(e.ernst ?? 'Laag'),
          },
        };
  return Onderhoud.herstel({
    id: OnderhoudId.van(e.onderhoudId),
    kunstwerkId: KunstwerkId.van(e.kunstwerkId),
    aanleiding,
    status: e.status as OnderhoudStatus,
    contractId: e.contractId ? ContractId.van(e.contractId) : undefined,
    aannemerId: e.aannemerId ? AannemerId.van(e.aannemerId) : undefined,
    gestartOp: e.gestartOp ?? undefined,
    afgerondOp: e.afgerondOp ?? undefined,
    resultaat: e.resultaat ?? undefined,
    inspecties: (e.inspecties ?? []).map((i) => ({
      id: InspectieId.van(i.inspectieId),
      datum: i.datum,
      oordeel: i.oordeel as InspectieOordeel,
      opmerkingen: i.opmerkingen ?? undefined,
    })),
    facturen: (e.facturen ?? []).map((f) => ({
      id: FactuurId.van(f.factuurId),
      bedrag: Bedrag.vanCenten(f.bedragCenten, f.valuta),
      status: f.status as FactuurStatus,
      ontvangenOp: f.ontvangenOp,
    })),
  });
}

@Injectable()
export class TypeOrmOnderhoudRepository implements OnderhoudRepository {
  constructor(@InjectRepository(OnderhoudEntity) private readonly repo: Repository<OnderhoudEntity>) {}

  async bewaar(o: Onderhoud): Promise<void> {
    await this.repo.save(onderhoudNaarEntity(o));
  }

  async zoek(id: OnderhoudId): Promise<Onderhoud | null> {
    const e = await this.repo.findOne({ where: { onderhoudId: id.waarde } });
    return e ? entityNaarOnderhoud(e) : null;
  }

  async zoekAlle(): Promise<Onderhoud[]> {
    return (await this.repo.find()).map(entityNaarOnderhoud);
  }

  async zoekPerKunstwerk(kunstwerkId: KunstwerkId): Promise<Onderhoud[]> {
    return (await this.repo.find({ where: { kunstwerkId: kunstwerkId.waarde } })).map(entityNaarOnderhoud);
  }
}
