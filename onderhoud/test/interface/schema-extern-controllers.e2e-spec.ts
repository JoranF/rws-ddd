import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { SchemaController } from '../../src/interface/http/schema.controller';
import { ExternController } from '../../src/interface/http/extern.controller';
import { DomeinFoutFilter } from '../../src/interface/http/domein-fout.filter';
import { MaakSchema } from '../../src/application/schema/maak-schema';
import { DienContractaanvraagIn } from '../../src/application/contractaanvraag/dien-contractaanvraag-in';
import { OntvangFactuur } from '../../src/application/onderhoud/ontvang-factuur';
import { StelDiagnose } from '../../src/application/diagnose/stel-diagnose';
import { StartOnderhoud } from '../../src/application/onderhoud/start-onderhoud';
import { SCHEMA_REPOSITORY } from '../../src/domain/repositories';
import {
  FakeContractenReadModel,
  FakeEventPublisher,
  InMemoryOnderhoudRepository,
  InMemorySchemaRepository,
  VasteIdGenerator,
} from '../support/fakes';

describe('Schema- en extern-controllers (e2e)', () => {
  let app: INestApplication;
  let publisher: FakeEventPublisher;
  let onderhouden: InMemoryOnderhoudRepository;
  let ids: VasteIdGenerator;

  beforeEach(async () => {
    publisher = new FakeEventPublisher();
    onderhouden = new InMemoryOnderhoudRepository();
    ids = new VasteIdGenerator('X');
    const schemas = new InMemorySchemaRepository();

    const moduleRef = await Test.createTestingModule({
      controllers: [SchemaController, ExternController],
      providers: [
        { provide: MaakSchema, useValue: new MaakSchema(schemas, new FakeContractenReadModel({ contractId: 'C1', opdrachtnemer: 'BAM' }), ids, 'soepel') },
        { provide: DienContractaanvraagIn, useValue: new DienContractaanvraagIn(publisher) },
        { provide: OntvangFactuur, useValue: new OntvangFactuur(onderhouden, ids) },
        { provide: SCHEMA_REPOSITORY, useValue: schemas },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new DomeinFoutFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('maakt een schema via POST /api/schemas', async () => {
    const antwoord = await request(app.getHttpServer())
      .post('/api/schemas')
      .send({ kunstwerkId: 'KW1', periodeStart: '2026-01-01', periodeEind: '2026-12-31', momenten: [{ datum: '2026-03-01', omschrijving: 'smeren' }] });
    expect(antwoord.status).toBe(201);
    expect(antwoord.body.schemaId).toBe('X-1');
  });

  it('geeft 400 bij een schema zonder momenten', async () => {
    const antwoord = await request(app.getHttpServer())
      .post('/api/schemas')
      .send({ kunstwerkId: 'KW1', periodeStart: '2026-01-01', periodeEind: '2026-12-31', momenten: [] });
    expect(antwoord.status).toBe(400);
  });

  it('ontvangt een externe factuur via de ACL', async () => {
    const { onderhoudId } = await new StelDiagnose(onderhouden, ids).uitvoeren({ kunstwerkId: 'KW1', bevinding: 'trilling', ernst: 'Kritiek' });
    await new StartOnderhoud(onderhouden, new FakeContractenReadModel(null), publisher, 'soepel').uitvoeren({ onderhoudId: onderhoudId!, datum: '2026-07-01' });
    const antwoord = await request(app.getHttpServer())
      .post('/api/extern/facturen')
      .send({ invoiceNumber: 'INV-1', workOrderRef: onderhoudId, totalExVatCents: 200000, vatCents: 42000, currency: 'EUR', issuedAt: '2026-07-06' });
    expect(antwoord.status).toBe(201);
    const traject = (await onderhouden.zoekAlle())[0];
    expect(traject.facturen[0].bedrag.euro).toBe(2420);
  });

  it('geeft 422 bij een niet-EUR-factuur', async () => {
    const antwoord = await request(app.getHttpServer())
      .post('/api/extern/facturen')
      .send({ invoiceNumber: 'INV-1', workOrderRef: 'O-1', totalExVatCents: 1, vatCents: 0, currency: 'USD', issuedAt: '2026-07-06' });
    expect(antwoord.status).toBe(422);
  });

  it('dient een contractaanvraag in en publiceert het event', async () => {
    const antwoord = await request(app.getHttpServer())
      .post('/api/contractaanvragen')
      .send({ kunstwerkId: 'KW1', aanleiding: 'nieuw onderhoudsregime' });
    expect(antwoord.status).toBe(202);
    expect(publisher.types()).toContain('onderhoud.contractaanvraag.ingediend');
  });
});
