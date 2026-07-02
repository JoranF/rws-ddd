import type { OnderhoudRepository, SchemaRepository, StoringRepository } from '../../src/domain/repositories';
import type { ContractenReadModel, EventPublisher, IdGenerator, KunstwerkenReadModel } from '../../src/application/ports';
import type { Storing } from '../../src/domain/storing/storing';
import type { Onderhoud } from '../../src/domain/onderhoud/onderhoud';
import type { OnderhoudsSchema } from '../../src/domain/schema/onderhouds-schema';
import type { KunstwerkId, OnderhoudId, SchemaId, StoringId } from '../../src/domain/gedeeld/waarden';
import type { OnderhoudDomainEvent } from '../../src/domain/gedeeld/domain-events';

export class InMemoryStoringRepository implements StoringRepository {
  private opslag = new Map<string, Storing>();
  async bewaar(s: Storing): Promise<void> { this.opslag.set(s.id.waarde, s); }
  async zoek(id: StoringId): Promise<Storing | null> { return this.opslag.get(id.waarde) ?? null; }
  async zoekAlle(): Promise<Storing[]> { return [...this.opslag.values()]; }
}

export class InMemoryOnderhoudRepository implements OnderhoudRepository {
  private opslag = new Map<string, Onderhoud>();
  async bewaar(o: Onderhoud): Promise<void> { this.opslag.set(o.id.waarde, o); }
  async zoek(id: OnderhoudId): Promise<Onderhoud | null> { return this.opslag.get(id.waarde) ?? null; }
  async zoekAlle(): Promise<Onderhoud[]> { return [...this.opslag.values()]; }
  async zoekPerKunstwerk(kunstwerkId: KunstwerkId): Promise<Onderhoud[]> {
    return [...this.opslag.values()].filter((o) => o.kunstwerkId.gelijkAan(kunstwerkId));
  }
}

export class InMemorySchemaRepository implements SchemaRepository {
  private opslag = new Map<string, OnderhoudsSchema>();
  async bewaar(s: OnderhoudsSchema): Promise<void> { this.opslag.set(s.id.waarde, s); }
  async zoek(id: SchemaId): Promise<OnderhoudsSchema | null> { return this.opslag.get(id.waarde) ?? null; }
  async zoekAlle(): Promise<OnderhoudsSchema[]> { return [...this.opslag.values()]; }
}

export class FakeEventPublisher implements EventPublisher {
  gepubliceerd: OnderhoudDomainEvent[] = [];
  async publiceer(events: OnderhoudDomainEvent[]): Promise<void> { this.gepubliceerd.push(...events); }
  types(): string[] { return this.gepubliceerd.map((e) => e.eventType); }
}

export class FakeKunstwerkenReadModel implements KunstwerkenReadModel {
  constructor(private antwoord = true) {}
  async isBekendEnInGebruik(): Promise<boolean> { return this.antwoord; }
}

export class FakeContractenReadModel implements ContractenReadModel {
  constructor(private contract: { contractId: string; opdrachtnemer: string } | null = null) {}
  async geldendContractVoor(): Promise<{ contractId: string; opdrachtnemer: string } | null> { return this.contract; }
}

export class VasteIdGenerator implements IdGenerator {
  private teller = 0;
  constructor(private readonly prefix = 'ID') {}
  nieuw(): string { this.teller += 1; return `${this.prefix}-${this.teller}`; }
}
