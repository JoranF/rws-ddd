import type {
  AanbestedingRepository,
  EventPublisher,
  IdGenerator,
  KunstwerkenReadModel,
  OnderhoudscontractRepository,
} from '../../src/application/ports.js';
import type { Aanbesteding } from '../../src/domain/aanbesteding/aanbesteding.js';
import type { Onderhoudscontract } from '../../src/domain/onderhoudscontract/onderhoudscontract.js';
import type { AanbestedingId, ContractId, KunstwerkId } from '../../src/domain/gedeeld/waarden.js';
import type { ContractDomainEvent } from '../../src/domain/gedeeld/domain-events.js';

export class InMemoryAanbestedingRepository implements AanbestedingRepository {
  private opslag = new Map<string, Aanbesteding>();
  async bewaar(a: Aanbesteding): Promise<void> { this.opslag.set(a.id.waarde, a); }
  async zoek(id: AanbestedingId): Promise<Aanbesteding | null> { return this.opslag.get(id.waarde) ?? null; }
  async zoekAlle(): Promise<Aanbesteding[]> { return [...this.opslag.values()]; }
}

export class InMemoryOnderhoudscontractRepository implements OnderhoudscontractRepository {
  private opslag = new Map<string, Onderhoudscontract>();
  async bewaar(c: Onderhoudscontract): Promise<void> { this.opslag.set(c.id.waarde, c); }
  async zoek(id: ContractId): Promise<Onderhoudscontract | null> { return this.opslag.get(id.waarde) ?? null; }
  async zoekAlle(): Promise<Onderhoudscontract[]> { return [...this.opslag.values()]; }
  async zoekPerKunstwerk(kunstwerkId: KunstwerkId): Promise<Onderhoudscontract[]> {
    return [...this.opslag.values()].filter((c) => c.kunstwerkId.gelijkAan(kunstwerkId));
  }
}

export class FakeEventPublisher implements EventPublisher {
  gepubliceerd: ContractDomainEvent[] = [];
  async publiceer(events: ContractDomainEvent[]): Promise<void> { this.gepubliceerd.push(...events); }
  types(): string[] { return this.gepubliceerd.map((e) => e.eventType); }
}

export class FakeKunstwerkenReadModel implements KunstwerkenReadModel {
  constructor(private antwoord = true) {}
  async isBekendEnInGebruik(): Promise<boolean> { return this.antwoord; }
}

export class VasteIdGenerator implements IdGenerator {
  private teller = 0;
  constructor(private readonly prefix = 'ID') {}
  nieuw(): string { this.teller += 1; return `${this.prefix}-${this.teller}`; }
}
