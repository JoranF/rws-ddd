import { OnderhoudsSchema } from '../../domain/schema/onderhouds-schema';
import { ContractId, KunstwerkId, Periode, SchemaId } from '../../domain/gedeeld/waarden';
import { DomeinFout } from '../../domain/gedeeld/fouten';
import type { SchemaRepository } from '../../domain/repositories';
import type { ContractenReadModel, IdGenerator } from '../ports';

export interface MaakSchemaCommand {
  kunstwerkId: string;
  periodeStart: string;
  periodeEind: string;
  momenten: Array<{ datum: string; omschrijving: string }>;
}

export class MaakSchema {
  constructor(
    private readonly schemas: SchemaRepository,
    private readonly contracten: ContractenReadModel,
    private readonly ids: IdGenerator,
    private readonly validatie: 'soepel' | 'streng',
  ) {}

  async uitvoeren(command: MaakSchemaCommand): Promise<{ schemaId: string }> {
    const kunstwerkId = KunstwerkId.van(command.kunstwerkId);
    const contract = await this.contracten.geldendContractVoor(kunstwerkId);
    if (!contract) {
      if (this.validatie === 'streng') throw new DomeinFout('geen geldend onderhoudscontract voor dit kunstwerk');
      console.warn(`geen geldend contract voor kunstwerk ${kunstwerkId.waarde} — soepele validatie, schema zonder contractkoppeling`);
    }

    const schema = OnderhoudsSchema.maak({
      id: SchemaId.van(this.ids.nieuw()),
      kunstwerkId,
      contractId: ContractId.van(contract?.contractId ?? 'ONBEKEND'),
      aannemer: contract?.opdrachtnemer ?? 'ONBEKEND',
      periode: Periode.van(new Date(command.periodeStart), new Date(command.periodeEind)),
      momenten: command.momenten.map((m) => ({ datum: new Date(m.datum), omschrijving: m.omschrijving })),
    });
    await this.schemas.bewaar(schema);
    return { schemaId: schema.id.waarde };
  }
}
