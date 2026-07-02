import { laadAuthConfig, laadConfig } from '../../src/infrastructure/config/config';

describe('laadConfig', () => {
  const basis = {
    SERVICE_PORT: '8003',
    DATABASE_URL: 'postgres://rws:rws@postgres:5432/onderhoud_db',
    RABBITMQ_URL: 'amqp://rws:rws@rabbitmq:5672',
  };

  it('leest de poort als getal en gebruikt soepele validatie als default', () => {
    const config = laadConfig(basis);
    expect(config.poort).toBe(8003);
    expect(config.validatie).toBe('soepel');
  });

  it('gooit als een verplichte variabele ontbreekt', () => {
    expect(() => laadConfig({ ...basis, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });
});

describe('laadAuthConfig', () => {
  it('staat standaard uit en gebruikt de Keycloak-defaults en eigen context-rol', () => {
    const auth = laadAuthConfig({});
    expect(auth.ingeschakeld).toBe(false);
    expect(auth.issuer).toBe('https://keycloak.joranit.com/realms/rws');
    expect(auth.jwksUri).toBe('https://keycloak.joranit.com/realms/rws/protocol/openid-connect/certs');
    expect(auth.vereisteRol).toBe('onderhoud');
  });

  it('schakelt auth alleen in bij AUTH_ENABLED="true" en respecteert overrides', () => {
    const auth = laadAuthConfig({ AUTH_ENABLED: 'true', OIDC_REQUIRED_ROLE: 'onderhoud', OIDC_ISSUER: 'https://voorbeeld/realm' });
    expect(auth.ingeschakeld).toBe(true);
    expect(auth.issuer).toBe('https://voorbeeld/realm');
    expect(auth.vereisteRol).toBe('onderhoud');
    expect(laadAuthConfig({ AUTH_ENABLED: '1' }).ingeschakeld).toBe(false);
  });
});
