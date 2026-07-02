import { AggregateRoot } from '../../src/domain/gedeeld/aggregate-root';
import type { OnderhoudDomainEvent } from '../../src/domain/gedeeld/domain-events';

class Test extends AggregateRoot {
  doe(): void {
    this.registreerEvent({
      eventType: 'onderhoud.storing.gemeld',
      data: { storingId: 'S1', kunstwerkId: 'KW1', omschrijving: 'brugdek trilt' },
    });
  }
}

describe('AggregateRoot', () => {
  it('verzamelt events en trekt ze daarna leeg', () => {
    const t = new Test();
    t.doe();
    const events: OnderhoudDomainEvent[] = t.trekEventsLeeg();
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('onderhoud.storing.gemeld');
    expect(t.trekEventsLeeg()).toHaveLength(0);
  });
});
