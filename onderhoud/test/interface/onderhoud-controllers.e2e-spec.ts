import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { StoringController } from '../../src/interface/http/storing.controller';
import { OnderhoudController } from '../../src/interface/http/onderhoud.controller';
import { DomeinFoutFilter } from '../../src/interface/http/domein-fout.filter';
import { MeldStoring } from '../../src/application/storing/meld-storing';
import { StelDiagnose } from '../../src/application/diagnose/stel-diagnose';
import { StartOnderhoud } from '../../src/application/onderhoud/start-onderhoud';
import { RegistreerInspectie } from '../../src/application/onderhoud/registreer-inspectie';
import { RondOnderhoudAf } from '../../src/application/onderhoud/rond-onderhoud-af';
import { OntvangFactuur } from '../../src/application/onderhoud/ontvang-factuur';
import { KeurFactuurGoed } from '../../src/application/onderhoud/keur-factuur-goed';
import { ONDERHOUD_REPOSITORY, STORING_REPOSITORY } from '../../src/domain/repositories';
import {
  FakeContractenReadModel,
  FakeEventPublisher,
  FakeKunstwerkenReadModel,
  InMemoryOnderhoudRepository,
  InMemoryStoringRepository,
  VasteIdGenerator,
} from '../support/fakes';

describe('Onderhoud-controllers (e2e)', () => {
  let app: INestApplication;
  let publisher: FakeEventPublisher;

  beforeEach(async () => {
    const storingen = new InMemoryStoringRepository();
    const onderhouden = new InMemoryOnderhoudRepository();
    publisher = new FakeEventPublisher();
    const ids = new VasteIdGenerator('X');

    const moduleRef = await Test.createTestingModule({
      controllers: [StoringController, OnderhoudController],
      providers: [
        { provide: MeldStoring, useValue: new MeldStoring(storingen, onderhouden, publisher, new FakeKunstwerkenReadModel(true), ids, 'soepel') },
        { provide: StelDiagnose, useValue: new StelDiagnose(onderhouden, ids) },
        { provide: StartOnderhoud, useValue: new StartOnderhoud(onderhouden, new FakeContractenReadModel({ contractId: 'C1', opdrachtnemer: 'BAM' }), publisher, 'soepel') },
        { provide: RegistreerInspectie, useValue: new RegistreerInspectie(onderhouden, ids) },
        { provide: RondOnderhoudAf, useValue: new RondOnderhoudAf(onderhouden, storingen, publisher) },
        { provide: OntvangFactuur, useValue: new OntvangFactuur(onderhouden, ids) },
        { provide: KeurFactuurGoed, useValue: new KeurFactuurGoed(onderhouden) },
        { provide: STORING_REPOSITORY, useValue: storingen },
        { provide: ONDERHOUD_REPOSITORY, useValue: onderhouden },
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

  it('meldt een storing via POST /api/storingen', async () => {
    const antwoord = await request(app.getHttpServer())
      .post('/api/storingen')
      .send({ kunstwerkId: 'KW1', omschrijving: 'scheur in pijler', ernst: 'Hoog' });
    expect(antwoord.status).toBe(201);
    expect(antwoord.body.storingId).toBe('X-1');
    expect(antwoord.body.onderhoudId).toBe('X-2');
    const lijst = await request(app.getHttpServer()).get('/api/storingen');
    expect(lijst.body).toHaveLength(1);
  });

  it('geeft 400 bij een ongeldige ernst', async () => {
    const antwoord = await request(app.getHttpServer())
      .post('/api/storingen')
      .send({ kunstwerkId: 'KW1', omschrijving: 'x', ernst: 'Enorm' });
    expect(antwoord.status).toBe(400);
  });

  it('doorloopt de hele trajectflow via de controllers', async () => {
    const diagnose = await request(app.getHttpServer())
      .post('/api/diagnoses')
      .send({ kunstwerkId: 'KW1', incidentId: 'INC1', bevinding: 'trilling', ernst: 'Kritiek' });
    expect(diagnose.status).toBe(201);
    const onderhoudId = diagnose.body.onderhoudId;

    expect((await request(app.getHttpServer()).post(`/api/onderhoud/${onderhoudId}/start`).send({ datum: '2026-07-01' })).status).toBe(200);
    expect((await request(app.getHttpServer()).post(`/api/onderhoud/${onderhoudId}/inspecties`).send({ datum: '2026-07-05', oordeel: 'Goedgekeurd' })).status).toBe(201);
    const factuur = await request(app.getHttpServer()).post(`/api/onderhoud/${onderhoudId}/facturen`).send({ bedragEuro: 2500, ontvangenOp: '2026-07-06' });
    expect(factuur.status).toBe(201);
    expect((await request(app.getHttpServer()).post(`/api/onderhoud/${onderhoudId}/afronden`).send({ resultaat: 'hersteld', datum: '2026-07-10' })).status).toBe(200);
    expect((await request(app.getHttpServer()).post(`/api/onderhoud/${onderhoudId}/facturen/${factuur.body.factuurId}/goedkeuring`).send()).status).toBe(200);

    const detail = await request(app.getHttpServer()).get(`/api/onderhoud/${onderhoudId}`);
    expect(detail.body.status).toBe('Afgerond');
    expect(publisher.types()).toEqual(expect.arrayContaining(['onderhoud.onderhoud.gestart', 'onderhoud.onderhoud.afgerond']));
  });

  it('geeft 200 zonder traject bij een diagnose onder de drempel', async () => {
    const antwoord = await request(app.getHttpServer())
      .post('/api/diagnoses')
      .send({ kunstwerkId: 'KW1', bevinding: 'lichte afwijking', ernst: 'Laag' });
    expect(antwoord.status).toBe(200);
    expect(antwoord.body.onderhoudId).toBeNull();
  });

  it('geeft 404 bij een onbekend traject', async () => {
    expect((await request(app.getHttpServer()).get('/api/onderhoud/BESTAAT-NIET')).status).toBe(404);
    expect((await request(app.getHttpServer()).post('/api/onderhoud/BESTAAT-NIET/start').send({ datum: '2026-07-01' })).status).toBe(404);
  });
});
