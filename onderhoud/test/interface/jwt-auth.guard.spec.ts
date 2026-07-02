import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';

// jose wordt gemockt zodat de test geen live JWKS-endpoint (of geïnstalleerde
// dependency) nodig heeft. jwtVerify geeft de payload terug die de test prikt;
// een geworpen fout simuleert een ongeldig/verlopen token.
let volgendePayload: unknown;
let verifyWerptFout = false;

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(() => 'fake-jwks'),
  jwtVerify: jest.fn(async () => {
    if (verifyWerptFout) throw new Error('token ongeldig');
    return { payload: volgendePayload };
  }),
}));

import { JwtAuthGuard } from '../../src/interface/http/auth/jwt-auth.guard';
import type { AuthConfig } from '../../src/infrastructure/config/config';

function context(method: string, authHeader?: string, path = '/api/onderhoud'): ExecutionContext {
  const request = { method, path, headers: authHeader ? { authorization: authHeader } : {} };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const BASIS_CONFIG: AuthConfig = {
  ingeschakeld: true,
  issuer: 'https://keycloak.joranit.com/realms/rws',
  jwksUri: 'https://keycloak.joranit.com/realms/rws/protocol/openid-connect/certs',
  vereisteRol: 'onderhoud',
};

describe('JwtAuthGuard', () => {
  beforeEach(() => {
    volgendePayload = {};
    verifyWerptFout = false;
  });

  it('laat alles door wanneer auth is uitgeschakeld', async () => {
    const guard = new JwtAuthGuard({ ...BASIS_CONFIG, ingeschakeld: false });
    await expect(guard.canActivate(context('POST'))).resolves.toBe(true);
  });

  it('geeft 401 bij een ontbrekend bearer-token', async () => {
    const guard = new JwtAuthGuard(BASIS_CONFIG);
    await expect(guard.canActivate(context('GET'))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('laat niet-/api-paden (zoals /health) door zonder token — APP_GUARD is app-breed', async () => {
    const guard = new JwtAuthGuard(BASIS_CONFIG);
    await expect(guard.canActivate(context('GET', undefined, '/health'))).resolves.toBe(true);
    await expect(guard.canActivate(context('GET', undefined, '/api-docs'))).resolves.toBe(true);
  });

  it('geeft 401 bij een ongeldig of verlopen token', async () => {
    verifyWerptFout = true;
    const guard = new JwtAuthGuard(BASIS_CONFIG);
    await expect(guard.canActivate(context('GET', 'Bearer kapot'))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('laat elke geldige gebruiker lezen (GET), ook zonder de eigen rol', async () => {
    volgendePayload = { realm_access: { roles: ['iets-anders'] } };
    const guard = new JwtAuthGuard(BASIS_CONFIG);
    await expect(guard.canActivate(context('GET', 'Bearer geldig'))).resolves.toBe(true);
  });

  it('geeft 403 bij een schrijfactie zonder de eigen context-rol', async () => {
    volgendePayload = { realm_access: { roles: ['monitoring'] } };
    const guard = new JwtAuthGuard(BASIS_CONFIG);
    await expect(guard.canActivate(context('POST', 'Bearer geldig'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('staat een schrijfactie toe met de eigen context-rol', async () => {
    volgendePayload = { realm_access: { roles: ['onderhoud'] } };
    const guard = new JwtAuthGuard(BASIS_CONFIG);
    await expect(guard.canActivate(context('POST', 'Bearer geldig'))).resolves.toBe(true);
    await expect(guard.canActivate(context('DELETE', 'Bearer geldig'))).resolves.toBe(true);
  });
});
