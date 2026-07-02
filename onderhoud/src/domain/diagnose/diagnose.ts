import type { Ernst, IncidentId } from '../gedeeld/waarden';

export interface Diagnose {
  incidentId?: IncidentId;
  bevinding: string;
  ernst: Ernst;
}

export function vereistOnderhoud(ernst: Ernst): boolean {
  return ernst === 'Hoog' || ernst === 'Kritiek';
}
