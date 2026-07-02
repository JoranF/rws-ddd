import { api, ApiError } from '../lib/api';
import { dateOnly, isoOffsetDays, nowIso } from '../lib/dates';

// Gedeelde staat die tussen de demo-stappen doorstroomt. Id's die stap N teruggeeft
// en stap N+M nodig heeft (aanbesteding, contract, incident, onderhoudstraject).
export interface DemoCtx {
  kunstwerkId: string;
  aanbestedingId?: string;
  contractId?: string;
  incidentId?: string;
  onderhoudId?: string;
}

export interface DemoStep {
  n: number;
  title: string;
  // De pijl(en) op de context-map die oplichten terwijl deze stap loopt.
  arrows: string[];
  run: (ctx: DemoCtx) => Promise<string>;
}

// Haalt een id uit een response, ongeacht exacte veldnaam.
const pickId = (o: unknown, ...keys: string[]): string | undefined => {
  if (!o || typeof o !== 'object') return undefined;
  const rec = o as Record<string, unknown>;
  for (const k of [...keys, 'id']) {
    const v = rec[k];
    if (typeof v === 'string' && v) return v;
    if (typeof v === 'number') return String(v);
  }
  return undefined;
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export const KUNSTWERK_ID = 'KW-DEMO-1';

export const DEMO_STEPS: DemoStep[] = [
  {
    n: 1,
    title: 'BEHEER — kunstwerk registreren',
    arrows: ['beheer-contract', 'beheer-monitoring', 'beheer-onderhoud'],
    run: async ctx => {
      await api.post('/beheer/api/kunstwerken', {
        kunstwerkId: ctx.kunstwerkId,
        naam: 'Brug A12',
        type: 'Brug',
        locatie: 'A12 km 4',
      });
      return `Kunstwerk ${ctx.kunstwerkId} geregistreerd.`;
    },
  },
  {
    n: 2,
    title: 'BEHEER — eisen vaststellen',
    arrows: ['beheer-contract', 'beheer-monitoring', 'beheer-onderhoud'],
    run: async ctx => {
      await api.post(`/beheer/api/kunstwerken/${ctx.kunstwerkId}/onderhoudseisen`, {
        eisen: [{ code: 'SPOOR', omschrijving: 'Spoorvorming maximaal', meetwaarde: 'spoorvorming', operator: '<=', grenswaarde: 8, eenheid: 'mm' }],
      });
      await api.post(`/beheer/api/kunstwerken/${ctx.kunstwerkId}/ontwerpeisen`, {
        eisen: [{ code: 'TRIL', omschrijving: 'Trillingsnorm', meetwaarde: 'trilling', operator: '<=', grenswaarde: 5, eenheid: 'mm/s' }],
      });
      return 'Onderhouds- en ontwerpeisen vastgesteld.';
    },
  },
  {
    n: 3,
    title: 'MONITORING — sessie starten (wacht op kunstwerk-event)',
    arrows: ['beheer-monitoring'],
    run: async ctx => {
      // Werkt pas zodra het kunstwerk-event bij monitoring verwerkt is. Retry met
      // polling tot 201 — dit maakt de event-latency zichtbaar in de demo.
      let last: unknown;
      for (let i = 0; i < 15; i++) {
        try {
          await api.post('/monitoring/api/sessies', { kunstwerkId: ctx.kunstwerkId });
          return `Monitoring-sessie gestart (na ${i + 1} poging${i ? 'en' : ''}).`;
        } catch (e) {
          last = e;
          if (e instanceof ApiError && e.status >= 500) throw e;
          await sleep(2000);
        }
      }
      throw last instanceof Error ? last : new Error('Sessie kon niet gestart worden');
    },
  },
  {
    n: 4,
    title: 'MONITORING — normale + kritieke meting → incident',
    arrows: [],
    run: async ctx => {
      await api.post('/monitoring/api/metingen', { kunstwerkId: ctx.kunstwerkId, sensorType: 'Trilling', waarde: 3 });
      await api.post('/monitoring/api/metingen', { kunstwerkId: ctx.kunstwerkId, sensorType: 'Trilling', waarde: 12 });
      // Incident ontstaat door de kritieke meting; even wachten en ophalen.
      await sleep(1500);
      const incidenten = await api.get<unknown[]>(`/monitoring/api/incidenten?kunstwerkId=${ctx.kunstwerkId}`);
      const laatste = incidenten[incidenten.length - 1];
      ctx.incidentId = pickId(laatste, 'incidentId');
      return `Kritieke meting (12 > 5 mm/s) → incident ${ctx.incidentId ?? '(id onbekend)'} aangemaakt.`;
    },
  },
  {
    n: 5,
    title: 'ONDERHOUD — traject verschijnt vanzelf (event!)',
    arrows: ['monitoring-onderhoud'],
    run: async ctx => {
      // Niets posten: bij ernst Hoog/Kritiek plant onderhoud automatisch een traject
      // na het incident-event. Pollen tot het verschijnt.
      for (let i = 0; i < 15; i++) {
        const trajecten = await api.get<Array<Record<string, unknown>>>('/onderhoud/api/onderhoud');
        const mijn = trajecten.find(t => t.kunstwerkId === ctx.kunstwerkId);
        if (mijn) {
          ctx.onderhoudId = pickId(mijn, 'onderhoudId', 'trajectId');
          return `Onderhoudstraject ${ctx.onderhoudId ?? ''} automatisch gepland (via event).`;
        }
        await sleep(2000);
      }
      throw new Error('Geen automatisch onderhoudstraject verschenen (event niet ontvangen?)');
    },
  },
  {
    n: 6,
    title: 'CONTRACT — aanbesteding, inschrijvingen, gunning (EMVI)',
    arrows: ['contract-onderhoud'],
    run: async ctx => {
      const aanbesteding = await api.post<Record<string, unknown>>('/contract/api/aanbestedingen', {
        kunstwerkId: ctx.kunstwerkId,
        sluitingsdatum: isoOffsetDays(7),
        prijsgewicht: 60,
        kwaliteitsgewicht: 40,
      });
      ctx.aanbestedingId = pickId(aanbesteding, 'aanbestedingId');
      if (!ctx.aanbestedingId) throw new Error('Geen aanbestedingId ontvangen');

      await api.post(`/contract/api/aanbestedingen/${ctx.aanbestedingId}/inschrijvingen`, { aannemer: 'BAM Infra', prijs: 120000, kwaliteitsscore: 8 });
      await api.post(`/contract/api/aanbestedingen/${ctx.aanbestedingId}/inschrijvingen`, { aannemer: 'Heijmans', prijs: 135000, kwaliteitsscore: 9 });

      const gunning = await api.post<Record<string, unknown>>(`/contract/api/aanbestedingen/${ctx.aanbestedingId}/gunning`, {
        looptijdStart: dateOnly(0),
        looptijdEind: dateOnly(365),
      });
      ctx.contractId = pickId(gunning, 'contractId');
      return `Gegund (EMVI). Contract ${ctx.contractId ?? '(id onbekend)'}.`;
    },
  },
  {
    n: 7,
    title: 'MONITORING — rapport → verschijnt bij BEHEER',
    arrows: ['monitoring-beheer', 'monitoring-contract'],
    run: async ctx => {
      await api.post('/monitoring/api/rapporten', {
        kunstwerkId: ctx.kunstwerkId,
        periodeStart: isoOffsetDays(-7),
        periodeEind: nowIso(),
      });
      await sleep(1500);
      const beoordelingen = await api.get<unknown[]>(`/beheer/api/rapportage-beoordelingen?kunstwerkId=${ctx.kunstwerkId}`);
      return `Rapport verstuurd; ${beoordelingen.length} beoordeling(en) bij Beheer.`;
    },
  },
  {
    n: 8,
    title: 'CONTRACT — prestatieverklaring (score uit monitoring-KPI)',
    arrows: ['monitoring-contract'],
    run: async ctx => {
      if (!ctx.contractId) throw new Error('Geen contractId — voer stap 6 eerst uit');
      await api.post(`/contract/api/contracten/${ctx.contractId}/prestatieverklaringen`, {
        periodeStart: dateOnly(0),
        periodeEind: dateOnly(30),
        bedrag: 25000,
      });
      return 'Prestatieverklaring ingediend (score automatisch uit monitoring-KPI).';
    },
  },
  {
    n: 9,
    title: 'ONDERHOUD — traject uitvoeren → beoordeling bij BEHEER',
    arrows: ['onderhoud-beheer'],
    run: async ctx => {
      if (!ctx.onderhoudId) throw new Error('Geen onderhoudId — wacht op stap 5');
      const base = `/onderhoud/api/onderhoud/${ctx.onderhoudId}`;
      await api.post(`${base}/start`, { datum: nowIso() });
      await api.post(`${base}/inspecties`, { datum: nowIso(), oordeel: 'Goedgekeurd' });
      await api.post(`${base}/afronden`, { resultaat: 'Lagers vervangen, trillingsniveau genormaliseerd', datum: nowIso() });
      return 'Traject gestart, geïnspecteerd en afgerond → onderhoudsrapport naar Beheer.';
    },
  },
  {
    n: 10,
    title: 'MONITORING — incident oplossen',
    arrows: [],
    run: async ctx => {
      if (!ctx.incidentId) throw new Error('Geen incidentId — voer stap 4 eerst uit');
      await api.post(`/monitoring/api/incidenten/${ctx.incidentId}/oplossing`, {});
      return `Incident ${ctx.incidentId} opgelost.`;
    },
  },
  {
    n: 11,
    title: 'FINALE — strenge validatie (onbekend kunstwerk geweigerd)',
    arrows: ['contract-onderhoud'],
    run: async () => {
      // Dit HOORT te falen: een gunning voor een onbekend kunstwerk wordt geweigerd
      // met een domeinfout. Dat is de feature — we vangen de fout en melden 'm positief.
      try {
        const aanbesteding = await api.post<Record<string, unknown>>('/contract/api/aanbestedingen', {
          kunstwerkId: 'KW-BESTAAT-NIET',
          sluitingsdatum: isoOffsetDays(7),
          prijsgewicht: 60,
          kwaliteitsgewicht: 40,
        });
        const id = pickId(aanbesteding, 'aanbestedingId');
        await api.post(`/contract/api/aanbestedingen/${id}/gunning`, {
          looptijdStart: dateOnly(0),
          looptijdEind: dateOnly(365),
        });
        throw new Error('Onverwacht: gunning voor onbekend kunstwerk werd NIET geweigerd!');
      } catch (e) {
        if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
          return `✅ Streng: gunning geweigerd (${e.status}) — alleen bekende kunstwerken. Domeinfout: ${JSON.stringify(e.body)}`;
        }
        throw e;
      }
    },
  },
];
