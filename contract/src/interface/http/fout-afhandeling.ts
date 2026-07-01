import { DomeinFout } from '../../domain/gedeeld/fouten.js';

export function naarHttpFout(fout: unknown): { code: number; body: { fout: string } } {
  if (fout instanceof DomeinFout) return { code: 400, body: { fout: fout.message } };
  return { code: 500, body: { fout: 'interne fout' } };
}
