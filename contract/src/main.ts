import { laadConfig } from './infrastructure/config.js';
import { bouwApp } from './interface/http/app.js';
import { maakPrismaClient } from './infrastructure/db/prisma-client.js';
import { RabbitMqConnectie } from './infrastructure/messaging/rabbitmq-connectie.js';
import { RabbitMqEventPublisher } from './infrastructure/messaging/rabbitmq-event-publisher.js';
import { PrismaAanbestedingRepository } from './infrastructure/db/prisma-aanbesteding-repository.js';
import { PrismaOnderhoudscontractRepository } from './infrastructure/db/prisma-onderhoudscontract-repository.js';
import { PrismaKunstwerkenReadModel } from './infrastructure/db/prisma-kunstwerken-read-model.js';
import { UuidIdGenerator } from './infrastructure/id-generator.js';
import { BeheerKunstwerkVerwerker, startBeheerConsumer } from './infrastructure/messaging/beheer-kunstwerk-consumer.js';
import { PrismaEventDedup } from './infrastructure/db/prisma-event-dedup.js';
import { PrismaOntwerpeisenReadModel } from './infrastructure/db/prisma-ontwerpeisen-read-model.js';
import { PrismaKpiReadModel } from './infrastructure/db/prisma-kpi-read-model.js';
import { BeheerOntwerpeisenVerwerker, startOntwerpeisenConsumer } from './infrastructure/messaging/beheer-ontwerpeisen-consumer.js';
import { MonitoringRapportVerwerker, startMonitoringRapportConsumer } from './infrastructure/messaging/monitoring-rapport-consumer.js';
import { PubliceerAanbesteding } from './application/aanbesteding/publiceer-aanbesteding.js';
import { OntvangInschrijving } from './application/aanbesteding/ontvang-inschrijving.js';
import { GunAanbesteding } from './application/aanbesteding/gun-aanbesteding.js';
import { KeurWijzigingGoed } from './application/onderhoudscontract/keur-wijziging-goed.js';
import { StelPrestatieverklaringOp } from './application/onderhoudscontract/stel-prestatieverklaring-op.js';
import { RondOnderhoudscontractAf } from './application/onderhoudscontract/rond-onderhoudscontract-af.js';

async function start(): Promise<void> {
  const config = laadConfig(process.env);
  const prisma = maakPrismaClient(config.databaseUrl);
  const rabbit = await RabbitMqConnectie.verbind(config.rabbitmqUrl);

  const ids = new UuidIdGenerator();
  const publisher = new RabbitMqEventPublisher(rabbit.kanaal);
  const aanbestedingRepo = new PrismaAanbestedingRepository(prisma);
  const contractRepo = new PrismaOnderhoudscontractRepository(prisma);
  const kunstwerken = new PrismaKunstwerkenReadModel(prisma);

  const app = await bouwApp({
    health: {
      db: async () => { await prisma.$queryRaw`SELECT 1`; return true; },
      broker: async () => rabbit.isVerbonden(),
    },
    aanbesteding: {
      publiceer: new PubliceerAanbesteding(aanbestedingRepo, publisher, ids),
      ontvangInschrijving: new OntvangInschrijving(aanbestedingRepo, publisher, ids),
      gun: new GunAanbesteding(aanbestedingRepo, contractRepo, publisher, kunstwerken, ids, config.kunstwerkValidatie),
      repo: aanbestedingRepo,
    },
    contract: {
      keurWijziging: new KeurWijzigingGoed(contractRepo, publisher, ids),
      stelPrestatie: new StelPrestatieverklaringOp(contractRepo, publisher, ids),
      rondAf: new RondOnderhoudscontractAf(contractRepo, publisher),
      repo: contractRepo,
    },
  });

  // Consumers (Fase 1 + Fase 2). Alle dedupliceren op eventId via de gedeelde VerwerktEvent-tabel.
  const dedup = new PrismaEventDedup(prisma);
  const ontwerpeisen = new PrismaOntwerpeisenReadModel(prisma);
  const kpi = new PrismaKpiReadModel(prisma);

  await startBeheerConsumer(rabbit, new BeheerKunstwerkVerwerker(kunstwerken, kunstwerken));
  await startOntwerpeisenConsumer(rabbit, new BeheerOntwerpeisenVerwerker(ontwerpeisen, dedup));
  await startMonitoringRapportConsumer(rabbit, new MonitoringRapportVerwerker(kpi, dedup));

  await app.listen({ host: '0.0.0.0', port: config.poort });
}

start().catch((fout) => {
  console.error('Opstarten mislukt', fout);
  process.exit(1);
});
