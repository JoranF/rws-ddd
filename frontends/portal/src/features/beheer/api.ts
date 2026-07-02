// REST-koppeling met de Beheer-service (FastAPI, poort 8004) via het relatieve
// proxypad /svc/beheer. Types spiegelen de response-DTO's van de service.
import { api } from '../../lib/api';

export interface Kunstwerk {
  kunstwerkId: string;
  naam: string;
  type: string;
  locatie: string;
  status: string;
  beheerder: string | null;
  jaarRenovatie: number | null;
  laatsteInspectiedatum: string | null;
  buitengebruikReden: string | null;
  buitengebruikDatum: string | null;
  aangemaaktOp: string;
  gewijzigdOp: string;
}

export interface Eis {
  code: string;
  omschrijving: string;
  meetwaarde: string;
  operator: string;
  grenswaarde: number;
  eenheid: string;
}

export interface Eisenpakket {
  eisenpakketId: string;
  kunstwerkId: string;
  soort: string;
  versie: number;
  status: string;
  eisen: Eis[];
  vastgesteldOp: string;
  onderhoudsstrategie: string | null;
}

export interface Bevinding {
  eisCode: string | null;
  meetwaarde: number | null;
  operator: string | null;
  grenswaarde: number | null;
  eenheid: string | null;
  resultaat: string;
  toelichting: string;
}

export interface Beoordeling {
  beoordelingId: string;
  externRapportId: string;
  kunstwerkId: string;
  rapportageType: string;
  ontvangenOp: string;
  eisenpakketId: string | null;
  resultaat: string;
  bevindingen: Bevinding[];
}

export const KUNSTWERK_TYPES = ['Brug', 'Sluis', 'Tunnel', 'Snelweg', 'Dijk', 'Gemaal', 'Stormvloedkering'];
export const EIS_OPERATORS = ['<', '<=', '>', '>=', '='];

// Kunstwerk-ID's zijn vrije invoer — altijd encoderen voordat ze in pad of query gaan.
const enc = encodeURIComponent;

export const beheerApi = {
  kunstwerken: () => api.get<Kunstwerk[]>('/svc/beheer/api/kunstwerken'),
  kunstwerk: (id: string) => api.get<Kunstwerk>(`/svc/beheer/api/kunstwerken/${enc(id)}`),
  registreer: (body: { kunstwerkId?: string; naam: string; type: string; locatie: string; beheerder?: string }) =>
    api.post<Kunstwerk>('/svc/beheer/api/kunstwerken', body),
  buitenGebruik: (id: string, body: { reden: string; datum: string }) =>
    api.post<Kunstwerk>(`/svc/beheer/api/kunstwerken/${enc(id)}/buitengebruikstelling`, body),
  eisen: (id: string) => api.get<Eisenpakket[]>(`/svc/beheer/api/kunstwerken/${enc(id)}/eisen`),
  stelEisenVast: (id: string, soort: 'onderhoudseisen' | 'ontwerpeisen', eisen: Eis[]) =>
    api.post<Eisenpakket>(`/svc/beheer/api/kunstwerken/${enc(id)}/${soort}`, { eisen }),
  beoordelingen: (kunstwerkId?: string) =>
    api.get<Beoordeling[]>(`/svc/beheer/api/rapportage-beoordelingen${kunstwerkId ? `?kunstwerkId=${enc(kunstwerkId)}` : ''}`),
};
