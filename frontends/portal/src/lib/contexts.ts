// De vier bounded contexts zoals het portaal ze kent. De volgorde hier is ook de
// volgorde in de navigatie. Kleur en taal komen uit de service-README's — geen synoniemen.

export type ContextKey = 'beheer' | 'monitoring' | 'onderhoud' | 'contract';

export interface BoundedContext {
  key: ContextKey;
  label: string;
  poort: number;
  kleur: string;
  rol: string;      // de rol die in deze context mag schrijven
  taak: string;     // korte omschrijving voor login/dashboards
}

export const CONTEXTS: Record<ContextKey, BoundedContext> = {
  beheer: {
    key: 'beheer', label: 'Beheer', poort: 8004, kleur: '#2f6fb6',
    rol: 'Beheerder',
    taak: 'Kunstwerk-register en eisen',
  },
  monitoring: {
    key: 'monitoring', label: 'Monitoring', poort: 8002, kleur: '#1f8a6d',
    rol: 'Monitoringanalist',
    taak: 'Sensordata en incidenten',
  },
  onderhoud: {
    key: 'onderhoud', label: 'Onderhoud', poort: 8003, kleur: '#c05621',
    rol: 'Aannemer',
    taak: 'Storingen en onderhoudstrajecten',
  },
  contract: {
    key: 'contract', label: 'Contract', poort: 8001, kleur: '#7a5aa6',
    rol: 'Contractmanager',
    taak: 'Aanbestedingen en contracten',
  },
};

export const CONTEXT_VOLGORDE: ContextKey[] = ['beheer', 'monitoring', 'onderhoud', 'contract'];
