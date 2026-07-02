import { StelDiagnose } from '../../src/application/diagnose/stel-diagnose';
import { StartOnderhoud } from '../../src/application/onderhoud/start-onderhoud';
import { RegistreerInspectie } from '../../src/application/onderhoud/registreer-inspectie';
import { RondOnderhoudAf } from '../../src/application/onderhoud/rond-onderhoud-af';
import { OntvangFactuur } from '../../src/application/onderhoud/ontvang-factuur';
import { KeurFactuurGoed } from '../../src/application/onderhoud/keur-factuur-goed';
import { MaakSchema } from '../../src/application/schema/maak-schema';
import { DienContractaanvraagIn } from '../../src/application/contractaanvraag/dien-contractaanvraag-in';
import { MeldStoring } from '../../src/application/storing/meld-storing';
import {
  FakeContractenReadModel,
  FakeEventPublisher,
  FakeKunstwerkenReadModel,
  InMemoryOnderhoudRepository,
  InMemorySchemaRepository,
  InMemoryStoringRepository,
  VasteIdGenerator,
} from '../support/fakes';

describe('traject-use-cases', () => {
  let storingen: InMemoryStoringRepository;
  let onderhouden: InMemoryOnderhoudRepository;
  let publisher: FakeEventPublisher;
  let ids: VasteIdGenerator;

  beforeEach(() => {
    storingen = new InMemoryStoringRepository();
    onderhouden = new InMemoryOnderhoudRepository();
    publisher = new FakeEventPublisher();
    ids = new VasteIdGenerator('X');
  });

  async function geplandTraject(): Promise<string> {
    const uc = new StelDiagnose(onderhouden, ids);
    const { onderhoudId } = await uc.uitvoeren({ kunstwerkId: 'KW1', bevinding: 'trilling', ernst: 'Kritiek' });
    return onderhoudId!;
  }

  it('start een traject en neemt het geldende contract over', async () => {
    const id = await geplandTraject();
    const contracten = new FakeContractenReadModel({ contractId: 'C1', opdrachtnemer: 'BAM' });
    await new StartOnderhoud(onderhouden, contracten, publisher, 'soepel').uitvoeren({ onderhoudId: id, datum: '2026-07-01' });
    const traject = (await onderhouden.zoekAlle())[0];
    expect(traject.status).toBe('Gestart');
    expect(traject.contractId?.waarde).toBe('C1');
    expect(publisher.types()).toContain('onderhoud.onderhoud.gestart');
  });

  it('weigert starten bij streng zonder geldend contract', async () => {
    const id = await geplandTraject();
    const uc = new StartOnderhoud(onderhouden, new FakeContractenReadModel(null), publisher, 'streng');
    await expect(uc.uitvoeren({ onderhoudId: id, datum: '2026-07-01' })).rejects.toThrow();
  });

  it('rondt af, handelt de gekoppelde storing af en publiceert het afgerond-event', async () => {
    const meld = new MeldStoring(storingen, onderhouden, publisher, new FakeKunstwerkenReadModel(true), ids, 'soepel');
    const { storingId, onderhoudId } = await meld.uitvoeren({ kunstwerkId: 'KW1', omschrijving: 'scheur', ernst: 'Hoog' });
    await new StartOnderhoud(onderhouden, new FakeContractenReadModel(null), publisher, 'soepel').uitvoeren({ onderhoudId: onderhoudId!, datum: '2026-07-01' });
    await new RegistreerInspectie(onderhouden, ids).uitvoeren({ onderhoudId: onderhoudId!, datum: '2026-07-05', oordeel: 'Goedgekeurd' });
    await new RondOnderhoudAf(onderhouden, storingen, publisher).uitvoeren({ onderhoudId: onderhoudId!, resultaat: 'hersteld', datum: '2026-07-10' });
    expect(publisher.types()).toContain('onderhoud.onderhoud.afgerond');
    const storing = (await storingen.zoekAlle()).find((s) => s.id.waarde === storingId)!;
    expect(storing.status).toBe('Afgehandeld');
  });

  it('ontvangt en keurt een factuur goed na afronding', async () => {
    const id = await geplandTraject();
    await new StartOnderhoud(onderhouden, new FakeContractenReadModel(null), publisher, 'soepel').uitvoeren({ onderhoudId: id, datum: '2026-07-01' });
    const { factuurId } = await new OntvangFactuur(onderhouden, ids).uitvoeren({ onderhoudId: id, bedragEuro: 2500, ontvangenOp: '2026-07-06' });
    await new RegistreerInspectie(onderhouden, ids).uitvoeren({ onderhoudId: id, datum: '2026-07-05', oordeel: 'Goedgekeurd' });
    await new RondOnderhoudAf(onderhouden, storingen, publisher).uitvoeren({ onderhoudId: id, resultaat: 'hersteld', datum: '2026-07-10' });
    await new KeurFactuurGoed(onderhouden).uitvoeren({ onderhoudId: id, factuurId });
    const traject = (await onderhouden.zoekAlle())[0];
    expect(traject.facturen[0].status).toBe('Goedgekeurd');
  });

  it('gooit bij een onbekend traject', async () => {
    const uc = new StartOnderhoud(onderhouden, new FakeContractenReadModel(null), publisher, 'soepel');
    await expect(uc.uitvoeren({ onderhoudId: 'BESTAAT-NIET', datum: '2026-07-01' })).rejects.toThrow();
  });
});

describe('MaakSchema', () => {
  it('maakt een schema met de gegunde aannemer uit het contract-read-model', async () => {
    const schemas = new InMemorySchemaRepository();
    const contracten = new FakeContractenReadModel({ contractId: 'C1', opdrachtnemer: 'BAM' });
    const uc = new MaakSchema(schemas, contracten, new VasteIdGenerator('SCH'), 'soepel');
    const { schemaId } = await uc.uitvoeren({
      kunstwerkId: 'KW1',
      periodeStart: '2026-01-01',
      periodeEind: '2026-12-31',
      momenten: [{ datum: '2026-03-01', omschrijving: 'smeren' }],
    });
    expect(schemaId).toBe('SCH-1');
    const schema = (await schemas.zoekAlle())[0];
    expect(schema.aannemer).toBe('BAM');
    expect(schema.contractId.waarde).toBe('C1');
  });

  it('weigert bij streng zonder geldend contract', async () => {
    const uc = new MaakSchema(new InMemorySchemaRepository(), new FakeContractenReadModel(null), new VasteIdGenerator('SCH'), 'streng');
    await expect(uc.uitvoeren({ kunstwerkId: 'KW1', periodeStart: '2026-01-01', periodeEind: '2026-12-31', momenten: [{ datum: '2026-03-01', omschrijving: 'x' }] })).rejects.toThrow();
  });
});

describe('DienContractaanvraagIn', () => {
  it('publiceert het ingediend-event', async () => {
    const publisher = new FakeEventPublisher();
    await new DienContractaanvraagIn(publisher).uitvoeren({ kunstwerkId: 'KW1', aanleiding: 'nieuw onderhoudsregime na inspectie' });
    expect(publisher.gepubliceerd).toEqual([
      { eventType: 'onderhoud.contractaanvraag.ingediend', data: { kunstwerkId: 'KW1', aanleiding: 'nieuw onderhoudsregime na inspectie' } },
    ]);
  });
});
