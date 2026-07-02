export interface AppConfig {
  poort: number;
  databaseUrl: string;
  rabbitmqUrl: string;
  validatie: 'soepel' | 'streng';
}

export const APP_CONFIG = 'APP_CONFIG';

function verplicht(env: NodeJS.ProcessEnv, naam: string): string {
  const waarde = env[naam];
  if (!waarde) throw new Error(`Ontbrekende omgevingsvariabele: ${naam}`);
  return waarde;
}

export function laadConfig(env: NodeJS.ProcessEnv): AppConfig {
  return {
    poort: Number(env.SERVICE_PORT ?? '8003'),
    databaseUrl: verplicht(env, 'DATABASE_URL'),
    rabbitmqUrl: verplicht(env, 'RABBITMQ_URL'),
    validatie: env.VALIDATIE === 'streng' ? 'streng' : 'soepel',
  };
}
