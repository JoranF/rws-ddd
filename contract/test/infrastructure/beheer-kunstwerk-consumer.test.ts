import { describe, expect, it } from 'vitest';
import { BeheerKunstwerkVerwerker, type EventDedup, type KunstwerkStore } from '../../src/infrastructure/messaging/beheer-kunstwerk-consumer.js';

class FakeStore implements KunstwerkStore {
  upserts: Array<{ id: string; inGebruik: boolean }> = [];
  async upsert(id: string, _type: string | null, _locatie: string | null): Promise<void> { this.upserts.push({ id, inGebruik: true }); }
  async markeerBuitenGebruik(id: string): Promise<void> { this.upserts.push({ id, inGebruik: false }); }
}
class FakeDedup implements EventDedup {
  private gezien = new Set<string>();
  async isVerwerkt(id: string): Promise<boolean> { return this.gezien.has(id); }
  async markeerVerwerkt(id: string): Promise<void> { this.gezien.add(id); }
}

describe('BeheerKunstwerkVerwerker', () => {
  it('vertaalt geregistreerd naar een upsert', async () => {
    const store = new FakeStore();
    const v = new BeheerKunstwerkVerwerker(store, new FakeDedup());
    await v.verwerk({ eventId: 'e1', eventType: 'beheer.kunstwerk.geregistreerd', data: { kunstwerkId: 'KW1', type: 'brug', locatie: 'A2' } });
    expect(store.upserts).toEqual([{ id: 'KW1', inGebruik: true }]);
  });

  it('is idempotent: hetzelfde eventId wordt maar één keer verwerkt', async () => {
    const store = new FakeStore();
    const dedup = new FakeDedup();
    const v = new BeheerKunstwerkVerwerker(store, dedup);
    const env = { eventId: 'e1', eventType: 'beheer.kunstwerk.buitengebruikgesteld', data: { kunstwerkId: 'KW1' } };
    await v.verwerk(env);
    await v.verwerk(env);
    expect(store.upserts).toEqual([{ id: 'KW1', inGebruik: false }]);
  });

  it('roept de buitengebruik-callback aan bij buitengebruikstelling, en maar één keer (idempotent)', async () => {
    const store = new FakeStore();
    const dedup = new FakeDedup();
    const gesignaleerd: string[] = [];
    const v = new BeheerKunstwerkVerwerker(store, dedup, async (id) => { gesignaleerd.push(id); });
    const env = { eventId: 'e1', eventType: 'beheer.kunstwerk.buitengebruikgesteld', data: { kunstwerkId: 'KW1' } };
    await v.verwerk(env);
    await v.verwerk(env);
    expect(gesignaleerd).toEqual(['KW1']);
  });

  it('roept de callback niet aan bij registratie', async () => {
    const store = new FakeStore();
    const gesignaleerd: string[] = [];
    const v = new BeheerKunstwerkVerwerker(store, new FakeDedup(), async (id) => { gesignaleerd.push(id); });
    await v.verwerk({ eventId: 'e2', eventType: 'beheer.kunstwerk.geregistreerd', data: { kunstwerkId: 'KW1', type: 'brug', locatie: 'A2' } });
    expect(gesignaleerd).toEqual([]);
  });
});
