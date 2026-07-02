export interface AuthConfig {
  /** Feature-flag: als false slaan we auth volledig over (huidig gedrag). */
  ingeschakeld: boolean;
  /** Verwachte token-uitgever (iss-claim). */
  issuer: string;
  /** JWKS-endpoint waar de publieke sleutels vandaan komen. */
  jwksUri: string;
  /** Rol die in realm_access.roles moet zitten voor schrijfacties (eigen context). */
  vereisteRol: string;
}

export interface Config {
  poort: number;
  databaseUrl: string;
  rabbitmqUrl: string;
  kunstwerkValidatie: 'soepel' | 'streng';
  auth: AuthConfig;
}

const STANDAARD_ISSUER = 'https://keycloak.joranit.com/realms/rws';
const STANDAARD_JWKS_URI =
  'https://keycloak.joranit.com/realms/rws/protocol/openid-connect/certs';
const EIGEN_CONTEXT_ROL = 'contract';

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
    auth: {
      ingeschakeld: env.AUTH_ENABLED === 'true',
      issuer: env.OIDC_ISSUER ?? STANDAARD_ISSUER,
      jwksUri: env.OIDC_JWKS_URI ?? STANDAARD_JWKS_URI,
      vereisteRol: env.OIDC_REQUIRED_ROLE ?? EIGEN_CONTEXT_ROL,
    },
  };
}
