export interface AuthConfig {
  ingeschakeld: boolean;
  issuer: string;
  jwksUri: string;
  vereisteRol: string;
}

export interface AppConfig {
  poort: number;
  databaseUrl: string;
  rabbitmqUrl: string;
  validatie: 'soepel' | 'streng';
  auth: AuthConfig;
}

export const APP_CONFIG = 'APP_CONFIG';
export const AUTH_CONFIG = 'AUTH_CONFIG';

const STANDAARD_ISSUER = 'https://keycloak.joranit.com/realms/rws';
const STANDAARD_JWKS_URI = 'https://keycloak.joranit.com/realms/rws/protocol/openid-connect/certs';
const EIGEN_CONTEXT_ROL = 'onderhoud';

function verplicht(env: NodeJS.ProcessEnv, naam: string): string {
  const waarde = env[naam];
  if (!waarde) throw new Error(`Ontbrekende omgevingsvariabele: ${naam}`);
  return waarde;
}

export function laadAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  return {
    ingeschakeld: env.AUTH_ENABLED === 'true',
    issuer: env.OIDC_ISSUER ?? STANDAARD_ISSUER,
    jwksUri: env.OIDC_JWKS_URI ?? STANDAARD_JWKS_URI,
    vereisteRol: env.OIDC_REQUIRED_ROLE ?? EIGEN_CONTEXT_ROL,
  };
}

export function laadConfig(env: NodeJS.ProcessEnv): AppConfig {
  return {
    poort: Number(env.SERVICE_PORT ?? '8003'),
    databaseUrl: verplicht(env, 'DATABASE_URL'),
    rabbitmqUrl: verplicht(env, 'RABBITMQ_URL'),
    validatie: env.VALIDATIE === 'streng' ? 'streng' : 'soepel',
    auth: laadAuthConfig(env),
  };
}
