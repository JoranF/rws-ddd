import { laadConfig } from './infrastructure/config.js';
import { bouwApp } from './interface/http/app.js';

async function start(): Promise<void> {
  const config = laadConfig(process.env);
  const app = bouwApp();
  await app.listen({ host: '0.0.0.0', port: config.poort });
}

start().catch((fout) => {
  console.error('Opstarten mislukt', fout);
  process.exit(1);
});
