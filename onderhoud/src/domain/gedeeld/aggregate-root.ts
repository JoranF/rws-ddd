import type { OnderhoudDomainEvent } from './domain-events';

export abstract class AggregateRoot {
  private events: OnderhoudDomainEvent[] = [];

  protected registreerEvent(event: OnderhoudDomainEvent): void {
    this.events.push(event);
  }

  trekEventsLeeg(): OnderhoudDomainEvent[] {
    const uit = this.events;
    this.events = [];
    return uit;
  }
}
