// REST-koppeling met de Monitoring-service (.NET, poort 8002) via het relatieve
// proxypad /svc/monitoring. Types spiegelen de response-DTO's van de service.
import { api } from '../../lib/api';

export interface SessieDto {
  id: string;
  kunstwerkId: string;
  status: string;
  gestartOp: string;
  beeindigdOp: string | null;
  aantalMetingen: number;
}

export interface MetingDto {
  id: string;
  kunstwerkId: string;
  sensorType: string;
  waarde: number;
  eenheid: string;
  tijdstip: string;
}

export interface IncidentDto {
  id: string;
  kunstwerkId: string;
  sensorType: string;
  gemetenWaarde: number;
  drempelwaarde: number;
  ernst: string;
  omschrijving: string;
  vervolgactie: string;
  status: string;
  aangemaaktOp: string;
  opgelostOp: string | null;
}

export interface RapportDto {
  id: string;
  kunstwerkId: string;
  periodeStart: string;
  periodeEind: string;
  zwaarsteOpenIncidentId: string | null;
  resultaten: unknown;
  opgesteldOp: string;
}

export const monitoringApi = {
  sessies: () => api.get<SessieDto[]>('/svc/monitoring/api/sessies'),
  startSessie: (body: { kunstwerkId: string }) =>
    api.post<{ id: string }>('/svc/monitoring/api/sessies', body),
  pauzeerSessie: (id: string) => api.post<void>(`/svc/monitoring/api/sessies/${id}/pauzering`),
  hervatSessie: (id: string) => api.post<void>(`/svc/monitoring/api/sessies/${id}/hervatting`),
  rondSessieAf: (id: string) => api.post<void>(`/svc/monitoring/api/sessies/${id}/afronding`),

  metingen: (kunstwerkId: string, sensorType?: string) =>
    api.get<MetingDto[]>(
      `/svc/monitoring/api/metingen?kunstwerkId=${encodeURIComponent(kunstwerkId)}${sensorType ? `&sensorType=${encodeURIComponent(sensorType)}` : ''}`,
    ),
  registreerMeting: (body: { kunstwerkId: string; sensorType: string; waarde: number }) =>
    api.post<MetingDto>('/svc/monitoring/api/metingen', body),

  incidenten: (filter?: { kunstwerkId?: string; status?: string }) => {
    const params = new URLSearchParams();
    if (filter?.kunstwerkId) params.set('kunstwerkId', filter.kunstwerkId);
    if (filter?.status) params.set('status', filter.status);
    const qs = params.toString();
    return api.get<IncidentDto[]>(`/svc/monitoring/api/incidenten${qs ? `?${qs}` : ''}`);
  },
  neemInBehandeling: (id: string) => api.post<void>(`/svc/monitoring/api/incidenten/${id}/inbehandelingname`),
  losOp: (id: string) => api.post<void>(`/svc/monitoring/api/incidenten/${id}/oplossing`),

  rapporten: (kunstwerkId?: string) =>
    api.get<RapportDto[]>(`/svc/monitoring/api/rapporten${kunstwerkId ? `?kunstwerkId=${encodeURIComponent(kunstwerkId)}` : ''}`),
  stelRapportOp: (body: { kunstwerkId: string; periodeStart: string; periodeEind: string }) =>
    api.post<{ id: string }>('/svc/monitoring/api/rapporten', body),
  stelNetwerkrapportageOp: (body: { periodeStart: string; periodeEind: string }) =>
    api.post<{ id: string }>('/svc/monitoring/api/netwerkrapportages', body),
};
