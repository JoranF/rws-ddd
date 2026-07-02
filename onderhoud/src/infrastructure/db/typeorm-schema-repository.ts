import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnderhoudsSchemaEntity } from './entities/onderhouds-schema.entity';
import { OnderhoudsSchema } from '../../domain/schema/onderhouds-schema';
import { ContractId, KunstwerkId, Periode, SchemaId } from '../../domain/gedeeld/waarden';
import type { SchemaRepository } from '../../domain/repositories';

export function schemaNaarEntity(s: OnderhoudsSchema): OnderhoudsSchemaEntity {
  const e = new OnderhoudsSchemaEntity();
  e.schemaId = s.id.waarde;
  e.kunstwerkId = s.kunstwerkId.waarde;
  e.contractId = s.contractId.waarde;
  e.aannemer = s.aannemer;
  e.periodeStart = s.periode.start;
  e.periodeEind = s.periode.eind;
  e.momenten = s.momenten.map((m) => ({ datum: m.datum.toISOString(), omschrijving: m.omschrijving }));
  return e;
}

export function entityNaarSchema(e: OnderhoudsSchemaEntity): OnderhoudsSchema {
  return OnderhoudsSchema.herstel({
    id: SchemaId.van(e.schemaId),
    kunstwerkId: KunstwerkId.van(e.kunstwerkId),
    contractId: ContractId.van(e.contractId),
    aannemer: e.aannemer,
    periode: Periode.van(new Date(e.periodeStart), new Date(e.periodeEind)),
    momenten: e.momenten.map((m) => ({ datum: new Date(m.datum), omschrijving: m.omschrijving })),
  });
}

@Injectable()
export class TypeOrmSchemaRepository implements SchemaRepository {
  constructor(@InjectRepository(OnderhoudsSchemaEntity) private readonly repo: Repository<OnderhoudsSchemaEntity>) {}

  async bewaar(s: OnderhoudsSchema): Promise<void> {
    await this.repo.save(schemaNaarEntity(s));
  }

  async zoek(id: SchemaId): Promise<OnderhoudsSchema | null> {
    const e = await this.repo.findOne({ where: { schemaId: id.waarde } });
    return e ? entityNaarSchema(e) : null;
  }

  async zoekAlle(): Promise<OnderhoudsSchema[]> {
    return (await this.repo.find()).map(entityNaarSchema);
  }
}
