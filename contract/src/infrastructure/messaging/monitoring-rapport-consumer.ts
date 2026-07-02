import type { RabbitMqConnectie } from './rabbitmq-connectie.js';
import { RWS_EXCHANGE } from './rabbitmq-connectie.js';
import type { EventDedup } from './beheer-kunstwerk-consumer.js';

export interface KpiInvoer {
  id: string;
  kunstwerkId: string;
  incidentId: string | null;
  kpiScore: number | null;
  resultaten: unknown;
}

export interface KpiStore {
  bewaarKpi(invoer: KpiInvoer): Promise<void>;
}

interface Envelope { eventId: string; eventType: string; data: Record<string, unknown> }

/**
 * Anti-corruption: vertaal het externe `resultaten`-model van Monitoring naar één
 * intern KPI-getal (0-100). Contract conformeert zich, maar laat de externe vorm niet
 * doorlekken naar het domein — hier gebeurt de vertaling.
 */
export function vertaalNaarKpiScore(resultaten: unknown): number | null {
  if (resultaten === null || typeof resultaten !== 'object') return null;
  const r = resultaten as Record<string, unknown>;
  const kandidaat = [r.kpiScore, r.score, r.beschikbaarheid].find((w) => typeof w === 'number');
  if (typeof kandidaat === 'number' && !Number.isNaN(kandidaat)) {
    return Math.max(0, Math.min(100, Math.round(kandidaat)));
  }
  // Monitoring's rapportvorm kent geen los scoregetal; leid er één af uit de
  // incidenttellingen: aandeel niet-open incidenten, 100 zonder incidenten.
  const totaal = r.totaalIncidenten;
  const open = r.openIncidenten;
  if (typeof totaal === 'number' && typeof open === 'number' && totaal >= 0 && open >= 0) {
    if (totaal === 0) return 100;
    return Math.max(0, Math.min(100, Math.round(100 * (1 - open / totaal))));
  }
  return null;
}

/**
 * Consumer voor `monitoring.rapport.opgesteld` (Monitoring = conformist upstream).
 * Vertaalt aan de rand naar het lokale KPI-read-model. Idempotent op eventId.
 */
export class MonitoringRapportVerwerker {
  constructor(private readonly store: KpiStore, private readonly dedup: EventDedup) {}

  async verwerk(env: Envelope): Promise<void> {
    if (await this.dedup.isVerwerkt(env.eventId)) return;
    const kunstwerkId = String(env.data.kunstwerkId ?? '');
    if (kunstwerkId === '') return;
    if (env.eventType === 'monitoring.rapport.opgesteld') {
      const incidentId = env.data.incidentId != null ? String(env.data.incidentId) : null;
      await this.store.bewaarKpi({
        id: `${kunstwerkId}:${incidentId ?? 'algemeen'}`,
        kunstwerkId,
        incidentId,
        kpiScore: vertaalNaarKpiScore(env.data.resultaten),
        resultaten: env.data.resultaten ?? {},
      });
    }
    await this.dedup.markeerVerwerkt(env.eventId);
  }
}

const QUEUE = 'contract.monitoring-rapport';

export async function startMonitoringRapportConsumer(connectie: RabbitMqConnectie, verwerker: MonitoringRapportVerwerker): Promise<void> {
  const kanaal = connectie.kanaal;
  await kanaal.assertQueue(QUEUE, { durable: true });
  await kanaal.bindQueue(QUEUE, RWS_EXCHANGE, 'monitoring.rapport.opgesteld');
  await kanaal.consume(QUEUE, async (bericht) => {
    if (!bericht) return;
    try {
      await verwerker.verwerk(JSON.parse(bericht.content.toString()));
      kanaal.ack(bericht);
    } catch {
      kanaal.nack(bericht, false, false);
    }
  });
}
