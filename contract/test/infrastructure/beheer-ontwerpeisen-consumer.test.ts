import { describe, expect, it } from 'vitest';
import { BeheerOntwerpeisenVerwerker, type OntwerpeisStore } from '../../src/infrastructure/messaging/beheer-ontwerpeisen-consumer.js';
import type { EventDedup } from '../../src/infrastructure/messaging/beheer-kunstwerk-consumer.js';

class FakeOntwerpeisStore implements OntwerpeisStore {
  opslag: Array<{ kunstwerkId: string; eisen: unknown }> = [];
  async bewaarEisen(kunstwerkId: string, eisen: unknown): Promise<void> { this.opslag.push({ kunstwerkId, eisen }); }
}
class FakeDedup implements EventDedup {
  private gezien = new Set<string>();
  async isVerwerkt(id: string): Promise<boolean> { return this.gezien.has(id); }
  async markeerVerwerkt(id: string): Promise<void> { this.gezien.add(id); }
}

describe('BeheerOntwerpeisenVerwerker', () => {
  it('bewaart de ontwerpeisen per kunstwerk', async () => {
    const store = new FakeOntwerpeisStore();
    const v = new BeheerOntwerpeisenVerwerker(store, new FakeDedup());
    await v.verwerk({ eventId: 'e1', eventType: 'beheer.ontwerpeisen.vastgesteld', data: { kunstwerkId: 'KW1', eisen: { maxBelasting: 40 } } });
    expect(store.opslag).toEqual([{ kunstwerkId: 'KW1', eisen: { maxBelasting: 40 } }]);
  });

  it('is idempotent op eventId', async () => {
    const store = new FakeOntwerpeisStore();
    const dedup = new FakeDedup();
    const v = new BeheerOntwerpeisenVerwerker(store, dedup);
    const env = { eventId: 'e1', eventType: 'beheer.ontwerpeisen.vastgesteld', data: { kunstwerkId: 'KW1', eisen: { a: 1 } } };
    await v.verwerk(env);
    await v.verwerk(env);
    expect(store.opslag).toHaveLength(1);
  });

  it('negeert een event zonder kunstwerkId', async () => {
    const store = new FakeOntwerpeisStore();
    const v = new BeheerOntwerpeisenVerwerker(store, new FakeDedup());
    await v.verwerk({ eventId: 'e2', eventType: 'beheer.ontwerpeisen.vastgesteld', data: { eisen: {} } });
    expect(store.opslag).toHaveLength(0);
  });
});
