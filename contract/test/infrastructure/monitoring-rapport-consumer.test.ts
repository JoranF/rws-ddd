import { describe, expect, it } from 'vitest';
import { MonitoringRapportVerwerker, vertaalNaarKpiScore, type KpiStore, type KpiInvoer } from '../../src/infrastructure/messaging/monitoring-rapport-consumer.js';
import type { EventDedup } from '../../src/infrastructure/messaging/beheer-kunstwerk-consumer.js';

class FakeKpiStore implements KpiStore {
  opslag: KpiInvoer[] = [];
  async bewaarKpi(invoer: KpiInvoer): Promise<void> { this.opslag.push(invoer); }
}
class FakeDedup implements EventDedup {
  private gezien = new Set<string>();
  async isVerwerkt(id: string): Promise<boolean> { return this.gezien.has(id); }
  async markeerVerwerkt(id: string): Promise<void> { this.gezien.add(id); }
}

describe('vertaalNaarKpiScore (anti-corruption)', () => {
  it('leest een expliciete score', () => {
    expect(vertaalNaarKpiScore({ score: 87 })).toBe(87);
  });
  it('valt terug op beschikbaarheid en klemt op 0-100', () => {
    expect(vertaalNaarKpiScore({ beschikbaarheid: 150 })).toBe(100);
    expect(vertaalNaarKpiScore({ beschikbaarheid: -3 })).toBe(0);
  });
  it('geeft null als er geen bruikbaar getal is', () => {
    expect(vertaalNaarKpiScore({ iets: 'x' })).toBeNull();
    expect(vertaalNaarKpiScore(null)).toBeNull();
  });
  it('leidt een score af uit de incidenttellingen van Monitoring (conformist)', () => {
    expect(vertaalNaarKpiScore({ perSensor: [], totaalIncidenten: 0, openIncidenten: 0, opgelosteIncidenten: 0 })).toBe(100);
    expect(vertaalNaarKpiScore({ totaalIncidenten: 4, openIncidenten: 1 })).toBe(75);
    expect(vertaalNaarKpiScore({ totaalIncidenten: 1, openIncidenten: 1 })).toBe(0);
  });
});

describe('MonitoringRapportVerwerker', () => {
  it('vertaalt een rapport naar KPI-invoer (ACL) en bewaart het', async () => {
    const store = new FakeKpiStore();
    const v = new MonitoringRapportVerwerker(store, new FakeDedup());
    await v.verwerk({ eventId: 'e1', eventType: 'monitoring.rapport.opgesteld', data: { kunstwerkId: 'KW1', incidentId: 'I9', resultaten: { score: 92, detail: 'ok' } } });
    expect(store.opslag).toEqual([{ id: 'KW1:I9', kunstwerkId: 'KW1', incidentId: 'I9', kpiScore: 92, resultaten: { score: 92, detail: 'ok' } }]);
  });

  it('is idempotent op eventId', async () => {
    const store = new FakeKpiStore();
    const dedup = new FakeDedup();
    const v = new MonitoringRapportVerwerker(store, dedup);
    const env = { eventId: 'e1', eventType: 'monitoring.rapport.opgesteld', data: { kunstwerkId: 'KW1', incidentId: 'I9', resultaten: { score: 92 } } };
    await v.verwerk(env);
    await v.verwerk(env);
    expect(store.opslag).toHaveLength(1);
  });
});
