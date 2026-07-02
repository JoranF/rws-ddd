import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { AuthConfig } from '../../infrastructure/config.js';
import { AuthFout } from './fout-afhandeling.js';

// Schrijfacties (POST/PUT/PATCH/DELETE) vereisen de eigen context-rol; lezen (GET) niet.
const SCHRIJFMETHODEN = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Vorm van de Keycloak-claim waarin de realm-rollen staan.
interface RealmAccess {
  roles?: string[];
}

/**
 * Bepaalt of een pad door de auth-hook beschermd moet worden.
 * Alleen /api/** is beschermd; /health en de swagger/openapi-docs blijven publiek.
 */
function isBeschermd(url: string): boolean {
  // Strip een eventuele query-string voordat we het pad matchen.
  const pad = url.split('?')[0];
  if (!pad.startsWith('/api/') && pad !== '/api') return false;
  // Swagger UI + OpenAPI-JSON blijven vrij, ook al staan ze onder /api.
  if (pad === '/api/docs' || pad.startsWith('/api/docs/')) return false;
  return true;
}

/** Haalt het bearer-token uit de Authorization-header, of null als het ontbreekt. */
function leesBearerToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [schema, token] = header.split(' ');
  if (schema?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

/** Haalt de realm-rollen veilig uit de token-payload. */
function leesRollen(payload: JWTPayload): string[] {
  const realmAccess = payload.realm_access as RealmAccess | undefined;
  return Array.isArray(realmAccess?.roles) ? realmAccess.roles : [];
}

/**
 * Registreert JWT-authenticatie als globale onRequest-hook.
 *
 * Gedrag:
 * - config.ingeschakeld === false: hook doet niets (huidig gedrag, tests blijven groen).
 * - Publieke routes (/health, swagger, alles buiten /api): altijd vrij.
 * - Beschermde routes zonder geldig token: 401.
 * - Schrijfacties zonder de vereiste rol in realm_access.roles: 403.
 *
 * De JWKS-sleutels worden door jose gecachet (createRemoteJWKSet), dus er is
 * niet per request een netwerkcall naar Keycloak.
 */
export function registreerAuth(app: FastifyInstance, config: AuthConfig): void {
  if (!config.ingeschakeld) return;

  const jwks = createRemoteJWKSet(new URL(config.jwksUri));

  app.addHook('onRequest', async (req) => {
    if (!isBeschermd(req.url)) return;

    const token = leesBearerToken(req);
    if (!token) throw new AuthFout('ontbrekend of ongeldig token', 401);

    let payload: JWTPayload;
    try {
      // Verifieert handtekening (RS256 via JWKS), issuer en expiry.
      // Geen audience-optie => geen audience-check (Keycloak's aud varieert).
      ({ payload } = await jwtVerify(token, jwks, {
        issuer: config.issuer,
        algorithms: ['RS256'],
      }));
    } catch {
      throw new AuthFout('ontbrekend of ongeldig token', 401);
    }

    // Autorisatie: elke geldige gebruiker mag lezen; schrijven vereist de eigen context-rol.
    if (SCHRIJFMETHODEN.has(req.method)) {
      const rollen = leesRollen(payload);
      if (!rollen.includes(config.vereisteRol)) {
        throw new AuthFout(`rol '${config.vereisteRol}' vereist voor deze actie`, 403);
      }
    }
  });
}
