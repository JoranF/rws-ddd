import { entityNaarStoring, storingNaarEntity } from '../../src/infrastructure/db/typeorm-storing-repository';
import { entityNaarOnderhoud, onderhoudNaarEntity } from '../../src/infrastructure/db/typeorm-onderhoud-repository';
import { entityNaarSchema, schemaNaarEntity } from '../../src/infrastructure/db/typeorm-schema-repository';
import { Storing } from '../../src/domain/storing/storing';
import { Onderhoud } from '../../src/domain/onderhoud/onderhoud';
import { OnderhoudsSchema } from '../../src/domain/schema/onderhouds-schema';
import { Bedrag, ContractId, FactuurId, InspectieId, KunstwerkId, OnderhoudId, Periode, SchemaId, StoringId } from '../../src/domain/gedeeld/waarden';

describe('typeorm-mapping', () => {
  it('mapt een Storing heen en terug', () => {
    const storing = Storing.meld({ id: StoringId.van('S1'), kunstwerkId: KunstwerkId.van('KW1'), omschrijving: 'scheur', ernst: 'Hoog' });
    storing.koppelAanOnderhoud(OnderhoudId.van('O1'));
    const terug = entityNaarStoring(storingNaarEntity(storing));
    expect(terug.id.waarde).toBe('S1');
    expect(terug.status).toBe('InBehandeling');
    expect(terug.onderhoudId?.waarde).toBe('O1');
    expect(terug.ernst).toBe('Hoog');
  });

  it('mapt een Onderhoud met inspecties en facturen heen en terug', () => {
    const traject = Onderhoud.plan({ id: OnderhoudId.van('O1'), kunstwerkId: KunstwerkId.van('KW1'), aanleiding: { soort: 'Diagnose', diagnose: { bevinding: 'trilling', ernst: 'Kritiek' } } });
    traject.start({ datum: new Date('2026-07-01'), contractId: ContractId.van('C1') });
    traject.registreerInspectie({ id: InspectieId.van('I1'), datum: new Date('2026-07-05'), oordeel: 'Goedgekeurd' });
    traject.ontvangFactuur({ id: FactuurId.van('F1'), bedrag: Bedrag.vanEuro(2500), ontvangenOp: new Date('2026-07-06') });
    const terug = entityNaarOnderhoud(onderhoudNaarEntity(traject));
    expect(terug.status).toBe('Gestart');
    expect(terug.aanleiding.soort).toBe('Diagnose');
    expect(terug.contractId?.waarde).toBe('C1');
    expect(terug.inspecties[0].oordeel).toBe('Goedgekeurd');
    expect(terug.facturen[0].bedrag.centen).toBe(250000);
  });

  it('mapt een OnderhoudsSchema heen en terug', () => {
    const schema = OnderhoudsSchema.maak({
      id: SchemaId.van('SCH1'),
      kunstwerkId: KunstwerkId.van('KW1'),
      contractId: ContractId.van('C1'),
      aannemer: 'BAM',
      periode: Periode.van(new Date('2026-01-01'), new Date('2026-12-31')),
      momenten: [{ datum: new Date('2026-03-01'), omschrijving: 'smeren' }],
    });
    const terug = entityNaarSchema(schemaNaarEntity(schema));
    expect(terug.aannemer).toBe('BAM');
    expect(terug.momenten[0].omschrijving).toBe('smeren');
  });
});
