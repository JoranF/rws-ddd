import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { AUTH_CONFIG, type AuthConfig } from '../../../infrastructure/config/config';

/** HTTP-methoden die als schrijfactie tellen en de eigen context-rol vereisen. */
const SCHRIJFMETHODEN = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface RealmAccess {
  roles?: string[];
}

/**
 * Valideert het bearer-token op /api-routes conform het gedeelde auth-contract:
 * - handtekening via de JWKS-uri (keys worden door jose gecached),
 * - issuer == geconfigureerde issuer, token niet verlopen (geen audience-check),
 * - elke geldige gebruiker mag lezen (GET/HEAD/OPTIONS),
 * - schrijfacties vereisen de eigen context-rol in realm_access.roles.
 *
 * Met AUTH_ENABLED != "true" wordt auth volledig overgeslagen (huidig gedrag).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private jwks?: JWTVerifyGetKey;

  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.config.ingeschakeld) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const payload = await this.verifieerToken(request);

    if (this.isSchrijfactie(request.method) && !this.heeftVereisteRol(payload)) {
      throw new ForbiddenException({ fout: `Rol '${this.config.vereisteRol}' vereist voor schrijfacties` });
    }

    return true;
  }

  private async verifieerToken(request: Request): Promise<JWTPayload> {
    const token = this.leesBearerToken(request);
    if (!token) throw new UnauthorizedException({ fout: 'Ontbrekend bearer-token' });

    try {
      const { payload } = await jwtVerify(token, this.sleutelset(), { issuer: this.config.issuer });
      return payload;
    } catch {
      throw new UnauthorizedException({ fout: 'Ongeldig of verlopen token' });
    }
  }

  private leesBearerToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header) return undefined;
    const [schema, waarde] = header.split(' ');
    if (schema?.toLowerCase() !== 'bearer' || !waarde) return undefined;
    return waarde;
  }

  private isSchrijfactie(methode: string): boolean {
    return SCHRIJFMETHODEN.has(methode.toUpperCase());
  }

  private heeftVereisteRol(payload: JWTPayload): boolean {
    const realmAccess = payload.realm_access as RealmAccess | undefined;
    return Array.isArray(realmAccess?.roles) && realmAccess.roles.includes(this.config.vereisteRol);
  }

  /** Lazy: bouw de JWKS-set pas bij de eerste beschermde request (jose cachet keys). */
  private sleutelset(): JWTVerifyGetKey {
    if (!this.jwks) {
      this.jwks = createRemoteJWKSet(new URL(this.config.jwksUri));
    }
    return this.jwks;
  }
}
