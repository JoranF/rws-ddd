// REST-koppeling met de Contract-service (Fastify, poort 8001) via het relatieve
// proxypad /svc/contract. Types spiegelen de weergave-DTO's van de service.
import { api } from '../../lib/api';

// ID's kunnen vrije invoer bevatten — altijd encoderen in pad en query.
const enc = encodeURIComponent;

export interface AanbestedingWeergave {
  aanbestedingId: string;
  kunstwerkId: string;
  status: string;
  aantalInschrijvingen: number;
}

export interface ContractWeergave {
  contractId: string;
  kunstwerkId: string;
  opdrachtnemer: string;
  status: string;
  waarde: number;
}

export const contractApi = {
  aanbestedingen: () => api.get<AanbestedingWeergave[]>('/svc/contract/api/aanbestedingen'),
  aanbesteding: (id: string) => api.get<AanbestedingWeergave>(`/svc/contract/api/aanbestedingen/${enc(id)}`),
  startAanbesteding: (body: { kunstwerkId: string; sluitingsdatum: string; prijsgewicht: number; kwaliteitsgewicht: number }) =>
    api.post<{ aanbestedingId: string }>('/svc/contract/api/aanbestedingen', body),
  dienInschrijvingIn: (id: string, body: { aannemer: string; prijs: number; kwaliteitsscore: number }) =>
    api.post<{ status: string }>(`/svc/contract/api/aanbestedingen/${enc(id)}/inschrijvingen`, body),
  gun: (id: string, body: { looptijdStart: string; looptijdEind: string }) =>
    api.post<{ contractId: string }>(`/svc/contract/api/aanbestedingen/${enc(id)}/gunning`, body),
  contracten: (kunstwerkId?: string) =>
    api.get<ContractWeergave[]>(`/svc/contract/api/contracten${kunstwerkId ? `?kunstwerkId=${enc(kunstwerkId)}` : ''}`),
  contract: (id: string) => api.get<ContractWeergave>(`/svc/contract/api/contracten/${enc(id)}`),
  dienPrestatieverklaringIn: (id: string, body: { periodeStart: string; periodeEind: string; bedrag: number }) =>
    api.post<{ status: string }>(`/svc/contract/api/contracten/${enc(id)}/prestatieverklaringen`, body),
  rondAf: (id: string, body: { datum: string }) =>
    api.post<{ status: string }>(`/svc/contract/api/contracten/${enc(id)}/afronding`, body),
};
