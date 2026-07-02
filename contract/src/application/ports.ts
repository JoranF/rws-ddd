import type { Aanbesteding } from '../domain/aanbesteding/aanbesteding.js';
import type { Onderhoudscontract } from '../domain/onderhoudscontract/onderhoudscontract.js';
import type { AanbestedingId, ContractId, KunstwerkId } from '../domain/gedeeld/waarden.js';
import type { ContractDomainEvent } from '../domain/gedeeld/domain-events.js';

export interface AanbestedingRepository {
  bewaar(a: Aanbesteding): Promise<void>;
  zoek(id: AanbestedingId): Promise<Aanbesteding | null>;
  zoekAlle(): Promise<Aanbesteding[]>;
}

export interface OnderhoudscontractRepository {
  bewaar(c: Onderhoudscontract): Promise<void>;
  zoek(id: ContractId): Promise<Onderhoudscontract | null>;
  zoekAlle(): Promise<Onderhoudscontract[]>;
  zoekPerKunstwerk(kunstwerkId: KunstwerkId): Promise<Onderhoudscontract[]>;
}

export interface EventPublisher {
  publiceer(events: ContractDomainEvent[]): Promise<void>;
}

export interface KunstwerkenReadModel {
  isBekendEnInGebruik(id: KunstwerkId): Promise<boolean>;
}

/**
 * Fase 2 (conformist op Monitoring): bron van de laatst bekende KPI-score per kunstwerk,
 * gevoed door `monitoring.rapport.opgesteld`. Voedt de prestatieverklaring.
 */
export interface KpiBron {
  laatsteKpiScore(kunstwerkId: string): Promise<number | null>;
}

export interface IdGenerator {
  nieuw(): string;
}
