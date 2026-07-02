import { describe, expect, it } from 'vitest';
import { AggregateRoot } from '../../src/domain/gedeeld/aggregate-root.js';
import type { ContractDomainEvent } from '../../src/domain/gedeeld/domain-events.js';

class Test extends AggregateRoot {
  doe(): void {
    this.registreerEvent({
      eventType: 'contract.aanbesteding.gepubliceerd',
      data: { aanbestedingId: 'A1', kunstwerkId: 'KW1', sluitingsdatum: '2026-09-01', gunningscriteria: { prijsgewicht: 60, kwaliteitsgewicht: 40 } },
    });
  }
}

describe('AggregateRoot', () => {
  it('verzamelt events en trekt ze daarna leeg', () => {
    const t = new Test();
    t.doe();
    const events: ContractDomainEvent[] = t.trekEventsLeeg();
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('contract.aanbesteding.gepubliceerd');
    expect(t.trekEventsLeeg()).toHaveLength(0);
  });
});
