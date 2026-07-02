export interface Config {
  poort: number;
  databaseUrl: string;
  rabbitmqUrl: string;
  kunstwerkValidatie: 'soepel' | 'streng';
}

function verplicht(env: NodeJS.ProcessEnv, naam: string): string {
  const waarde = env[naam];
  if (!waarde) throw new Error(`Ontbrekende omgevingsvariabele: ${naam}`);
  return waarde;
}

export function laadConfig(env: NodeJS.ProcessEnv): Config {
  return {
    poort: Number(env.SERVICE_PORT ?? '8001'),
    databaseUrl: verplicht(env, 'DATABASE_URL'),
    rabbitmqUrl: verplicht(env, 'RABBITMQ_URL'),
    kunstwerkValidatie: env.KUNSTWERK_VALIDATIE === 'streng' ? 'streng' : 'soepel',
  };
}
