import { execSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';

import { PrismaAanbestedingRepository } from '../../src/infrastructure/db/prisma-aanbesteding-repository.js';
import { PrismaOnderhoudscontractRepository } from '../../src/infrastructure/db/prisma-onderhoudscontract-repository.js';
import { PrismaKunstwerkenReadModel } from '../../src/infrastructure/db/prisma-kunstwerken-read-model.js';
import { PrismaOutboxEventPublisher } from '../../src/infrastructure/db/prisma-outbox-event-publisher.js';
import { PrismaOutboxStore } from '../../src/infrastructure/db/prisma-outbox-store.js';
import { BeheerKunstwerkVerwerker } from '../../src/infrastructure/messaging/beheer-kunstwerk-consumer.js';

import { Aanbesteding } from '../../src/domain/aanbesteding/aanbesteding.js';
import { Onderhoudscontract } from '../../src/domain/onderhoudscontract/onderhoudscontract.js';
import { GunAanbesteding } from '../../src/application/aanbesteding/gun-aanbesteding.js';
import {
  Aannemer, AanbestedingId, Bedrag, Contractperiode, ContractId, Gunningscriteria, KunstwerkId,
} from '../../src/domain/gedeeld/waarden.js';
import { FakeEventPublisher, VasteIdGenerator } from '../support/fakes.js';

/**
 * Integratietests tegen een echte Postgres (Testcontainers). Dekt de Prisma-repos,
 * de outbox en de consumer -> read-model -> strenge validatie flow.
 * Vereist Docker. Draai met `npm run test:integration`.
 */
let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16').withDatabase('contract_it').start();
  const url = container.getConnectionUri();
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
  prisma = new PrismaClient({ datasources: { db: { url } } });
});

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe('PrismaOnderhoudscontractRepository (integratie)', () => {
  it('bewaart en herstelt een contract inclusief wijziging', async () => {
    const repo = new PrismaOnderhoudscontractRepository(prisma);
    const contract = Onderhoudscontract.gun({
      id: ContractId.van('IT-C1'),
      kunstwerkId: KunstwerkId.van('IT-KW1'),
      opdrachtnemer: Aannemer.van('BAM'),
      looptijd: Contractperiode.van(new Date('2026-01-01'), new Date('2026-12-31')),
      waarde: Bedrag.vanEuro(1000),
    });
    contract.keurWijzigingGoed({ id: 'W1', mutatie: Bedrag.vanEuro(200), soort: 'Verhoging', reden: 'meerwerk', datum: new Date('2026-03-01') });
    contract.trekEventsLeeg();
    await repo.bewaar(contract);

    const geladen = await repo.zoek(ContractId.van('IT-C1'));
    expect(geladen).not.toBeNull();
    expect(geladen!.waarde.euro).toBe(1200);
    expect(geladen!.opdrachtnemerNaam).toBe('BAM');
    expect((await repo.zoekPerKunstwerk(KunstwerkId.van('IT-KW1')))).toHaveLength(1);
  });
});

describe('PrismaAanbestedingRepository (integratie)', () => {
  it('bewaart en herstelt een aanbesteding met inschrijving', async () => {
    const repo = new PrismaAanbestedingRepository(prisma);
    const aanbesteding = Aanbesteding.publiceer({
      id: AanbestedingId.van('IT-A1'),
      kunstwerkId: KunstwerkId.van('IT-KW1'),
      sluitingsdatum: new Date('2026-09-01'),
      criteria: Gunningscriteria.van(60, 40),
    });
    aanbesteding.ontvangInschrijving({ id: 'IT-A1-I1', aannemer: Aannemer.van('Heijmans'), prijs: Bedrag.vanEuro(500), kwaliteitsscore: 70 });
    aanbesteding.trekEventsLeeg();
    await repo.bewaar(aanbesteding);

    const geladen = await repo.zoek(AanbestedingId.van('IT-A1'));
    expect(geladen!.inschrijvingen).toHaveLength(1);
    expect(geladen!.criteria.prijsgewicht).toBe(60);
  });
});

describe('Outbox (integratie)', () => {
  it('schrijft events weg en levert ze precies één keer aan de relay-store', async () => {
    const uitgever = new PrismaOutboxEventPublisher(prisma);
    await uitgever.publiceer([
      { eventType: 'contract.onderhoudscontract.afgerond', data: { contractId: 'IT-C1', kunstwerkId: 'IT-KW1', datum: '2026-12-31' } },
    ]);
    const store = new PrismaOutboxStore(prisma);
    const eerste = await store.pakOnverzonden(10);
    expect(eerste.some((r) => r.routingKey === 'contract.onderhoudscontract.afgerond')).toBe(true);
    await store.markeerVerzonden(eerste.map((r) => r.id));
    const tweede = await store.pakOnverzonden(10);
    expect(tweede).toHaveLength(0);
  });
});

describe('Consumer -> read-model -> strenge validatie (integratie)', () => {
  it('gunt onder streng pas nadat het kunstwerk via een beheer-event bekend is', async () => {
    const readModel = new PrismaKunstwerkenReadModel(prisma);
    const aanbestedingRepo = new PrismaAanbestedingRepository(prisma);
    const contractRepo = new PrismaOnderhoudscontractRepository(prisma);
    const publisher = new FakeEventPublisher();

    const aanbesteding = Aanbesteding.publiceer({
      id: AanbestedingId.van('IT-A2'),
      kunstwerkId: KunstwerkId.van('IT-KW-STRENG'),
      sluitingsdatum: new Date('2026-09-01'),
      criteria: Gunningscriteria.van(60, 40),
    });
    aanbesteding.ontvangInschrijving({ id: 'IT-A2-I1', aannemer: Aannemer.van('BAM'), prijs: Bedrag.vanEuro(1000), kwaliteitsscore: 80 });
    aanbesteding.trekEventsLeeg();
    await aanbestedingRepo.bewaar(aanbesteding);

    const gun = new GunAanbesteding(aanbestedingRepo, contractRepo, publisher, readModel, new VasteIdGenerator('IT-C'), 'streng');

    // Kunstwerk nog onbekend -> streng weigert.
    await expect(gun.uitvoeren({ aanbestedingId: 'IT-A2', looptijdStart: '2026-01-01', looptijdEind: '2026-12-31' })).rejects.toThrow();

    // Beheer-event komt binnen -> read-model gevuld.
    const verwerker = new BeheerKunstwerkVerwerker(readModel, readModel);
    await verwerker.verwerk({ eventId: 'IT-e1', eventType: 'beheer.kunstwerk.geregistreerd', data: { kunstwerkId: 'IT-KW-STRENG', type: 'brug', locatie: 'A2' } });

    // Nu slaagt de gunning.
    const { contractId } = await gun.uitvoeren({ aanbestedingId: 'IT-A2', looptijdStart: '2026-01-01', looptijdEind: '2026-12-31' });
    expect(contractId).toBe('IT-C-1');
    expect(publisher.types()).toContain('contract.onderhoudscontract.gegund');
  });
});
