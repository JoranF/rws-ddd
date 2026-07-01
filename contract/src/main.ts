import { laadConfig } from './infrastructure/config.js';
import { bouwApp } from './interface/http/app.js';
import { maakPrismaClient } from './infrastructure/db/prisma-client.js';

async function start(): Promise<void> {
  const config = laadConfig(process.env);
  const prisma = maakPrismaClient(config.databaseUrl);

  const app = bouwApp({
    health: {
      db: async () => {
        await prisma.$queryRaw`SELECT 1`;
        return true;
      },
    },
  });

  await app.listen({ host: '0.0.0.0', port: config.poort });
}

start().catch((fout) => {
  console.error('Opstarten mislukt', fout);
  process.exit(1);
});
