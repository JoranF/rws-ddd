import { MonitoringIncidentVerwerker } from '../../src/infrastructure/messaging/monitoring-incident-consumer';
import { ContractVerwerker, type ContractStore } from '../../src/infrastructure/messaging/contract-consumer';
import { BeheerVerwerker, type BeheerStore } from '../../src/infrastructure/messaging/beheer-consumer';
import type { EventDedup } from '../../src/infrastructure/messaging/consumer-helpers';
import { StelDiagnose } from '../../src/application/diagnose/stel-diagnose';
import { InMemoryOnderhoudRepository, VasteIdGenerator } from '../support/fakes';

class FakeDedup implements EventDedup {
  private gezien = new Set<string>();
  async isVerwerkt(id: string): Promise<boolean> { return this.gezien.has(id); }
  async markeerVerwerkt(id: string): Promise<void> { this.gezien.add(id); }
}

describe('MonitoringIncidentVerwerker', () => {
  it('vertaalt een incident naar StelDiagnose en plant bij Kritiek een traject', async () => {
    const onderhouden = new InMemoryOnderhoudRepository();
    const v = new MonitoringIncidentVerwerker(new StelDiagnose(onderhouden, new VasteIdGenerator('O')), new FakeDedup());
    await v.verwerk({ eventId: 'e1', eventType: 'monitoring.incident.aangemaakt', data: { incidentId: 'INC1', kunstwerkId: 'KW1', ernst: 'Kritiek', omschrijving: 'trilling boven drempel' } });
    const trajecten = await onderhouden.zoekAlle();
    expect(trajecten).toHaveLength(1);
    expect(trajecten[0].aanleiding.soort).toBe('Diagnose');
  });

  it('is idempotent op eventId', async () => {
    const onderhouden = new InMemoryOnderhoudRepository();
    const v = new MonitoringIncidentVerwerker(new StelDiagnose(onderhouden, new VasteIdGenerator('O')), new FakeDedup());
    const env = { eventId: 'e1', eventType: 'monitoring.incident.aangemaakt', data: { incidentId: 'INC1', kunstwerkId: 'KW1', ernst: 'Hoog', omschrijving: 'x' } };
    await v.verwerk(env);
    await v.verwerk(env);
    expect(await onderhouden.zoekAlle()).toHaveLength(1);
  });
});

describe('ContractVerwerker', () => {
  class FakeStore implements ContractStore {
    acties: string[] = [];
    async upsertGegund(p: { contractId: string }): Promise<void> { this.acties.push(`gegund:${p.contractId}`); }
    async markeerAfgerond(contractId: string): Promise<void> { this.acties.push(`afgerond:${contractId}`); }
  }

  it('verwerkt gegund en afgerond', async () => {
    const store = new FakeStore();
    const v = new ContractVerwerker(store, new FakeDedup());
    await v.verwerk({ eventId: 'e1', eventType: 'contract.onderhoudscontract.gegund', data: { contractId: 'C1', kunstwerkId: 'KW1', opdrachtnemer: 'BAM', looptijd: { start: '2026-01-01', eind: '2026-12-31' } } });
    await v.verwerk({ eventId: 'e2', eventType: 'contract.onderhoudscontract.afgerond', data: { contractId: 'C1', kunstwerkId: 'KW1', datum: '2026-12-31' } });
    expect(store.acties).toEqual(['gegund:C1', 'afgerond:C1']);
  });
});

describe('BeheerVerwerker', () => {
  class FakeStore implements BeheerStore {
    acties: string[] = [];
    async upsertKunstwerk(kunstwerkId: string): Promise<void> { this.acties.push(`kunstwerk:${kunstwerkId}`); }
    async markeerBuitenGebruik(kunstwerkId: string): Promise<void> { this.acties.push(`buitengebruik:${kunstwerkId}`); }
    async bewaarEisen(kunstwerkId: string): Promise<void> { this.acties.push(`eisen:${kunstwerkId}`); }
  }

  it('verwerkt kunstwerk- en eisen-events', async () => {
    const store = new FakeStore();
    const v = new BeheerVerwerker(store, new FakeDedup());
    await v.verwerk({ eventId: 'e1', eventType: 'beheer.kunstwerk.geregistreerd', data: { kunstwerkId: 'KW1', type: 'brug', locatie: 'A2' } });
    await v.verwerk({ eventId: 'e2', eventType: 'beheer.onderhoudseisen.vastgesteld', data: { kunstwerkId: 'KW1', eisen: ['jaarlijkse inspectie'] } });
    await v.verwerk({ eventId: 'e3', eventType: 'beheer.kunstwerk.buitengebruikgesteld', data: { kunstwerkId: 'KW1', reden: 'sloop' } });
    expect(store.acties).toEqual(['kunstwerk:KW1', 'eisen:KW1', 'buitengebruik:KW1']);
  });
});
