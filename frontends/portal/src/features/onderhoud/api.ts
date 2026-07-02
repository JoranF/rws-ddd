// REST-koppeling met de Onderhoud-service (NestJS, poort 8003) via het relatieve
// proxypad /svc/onderhoud. Types spiegelen de response-DTO's van de service.
import { api } from '../../lib/api';

// ID's komen o.a. uit route-params (gedecodeerd) — altijd encoderen in het pad.
const enc = encodeURIComponent;

export interface Inspectie {
  inspectieId: string;
  datum: string;
  oordeel: string;
  opmerkingen: string | null;
}

export interface Factuur {
  factuurId: string;
  bedragEuro: number;
  status: string;
  ontvangenOp: string;
}

export interface Onderhoud {
  onderhoudId: string;
  kunstwerkId: string;
  status: string;
  aanleiding: string;
  contractId: string | null;
  gestartOp: string | null;
  afgerondOp: string | null;
  resultaat: string | null;
  inspecties: Inspectie[];
  facturen: Factuur[];
}

export interface Storing {
  storingId: string;
  kunstwerkId: string;
  omschrijving: string;
  ernst: string;
  status: string;
  onderhoudId: string | null;
}

export const ERNST_OPTIES = ['Laag', 'Middel', 'Hoog', 'Kritiek'];
export const OORDEEL_OPTIES = ['Goedgekeurd', 'Afgekeurd'];

export const onderhoudApi = {
  trajecten: () => api.get<Onderhoud[]>('/svc/onderhoud/api/onderhoud'),
  traject: (id: string) => api.get<Onderhoud>(`/svc/onderhoud/api/onderhoud/${enc(id)}`),
  start: (id: string, body: { datum: string }) =>
    api.post<{ status: string }>(`/svc/onderhoud/api/onderhoud/${enc(id)}/start`, body),
  registreerInspectie: (id: string, body: { datum: string; oordeel: string; opmerkingen?: string }) =>
    api.post<unknown>(`/svc/onderhoud/api/onderhoud/${enc(id)}/inspecties`, body),
  rondAf: (id: string, body: { resultaat: string; datum: string }) =>
    api.post<{ status: string }>(`/svc/onderhoud/api/onderhoud/${enc(id)}/afronden`, body),
  registreerFactuur: (id: string, body: { bedragEuro: number; ontvangenOp: string }) =>
    api.post<Factuur>(`/svc/onderhoud/api/onderhoud/${enc(id)}/facturen`, body),
  keurFactuurGoed: (id: string, factuurId: string) =>
    api.post<{ status: string }>(`/svc/onderhoud/api/onderhoud/${enc(id)}/facturen/${enc(factuurId)}/goedkeuring`),
  storingen: () => api.get<Storing[]>('/svc/onderhoud/api/storingen'),
  meldStoring: (body: { kunstwerkId: string; omschrijving: string; ernst: string }) =>
    api.post<Storing>('/svc/onderhoud/api/storingen', body),
  dienContractaanvraagIn: (body: { kunstwerkId: string; aanleiding: string }) =>
    api.post<{ status: string }>('/svc/onderhoud/api/contractaanvragen', body),
};
