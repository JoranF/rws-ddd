import { DomeinFout } from '../../domain/gedeeld/fouten.js';

/**
 * Fout in de authenticatie-/autorisatielaag. `status` is de HTTP-code:
 * 401 = niet (geldig) ingelogd, 403 = ingelogd maar mist de vereiste rol.
 */
export class AuthFout extends Error {
  constructor(bericht: string, readonly status: 401 | 403) {
    super(bericht);
    this.name = 'AuthFout';
  }
}

export function naarHttpFout(fout: unknown): { code: number; body: { fout: string } } {
  if (fout instanceof AuthFout) return { code: fout.status, body: { fout: fout.message } };
  if (fout instanceof DomeinFout) return { code: 400, body: { fout: fout.message } };
  return { code: 500, body: { fout: 'interne fout' } };
}
