import type { ContractDomainEvent } from './domain-events.js';

export abstract class AggregateRoot {
  private events: ContractDomainEvent[] = [];

  protected registreerEvent(event: ContractDomainEvent): void {
    this.events.push(event);
  }

  trekEventsLeeg(): ContractDomainEvent[] {
    const uit = this.events;
    this.events = [];
    return uit;
  }
}
