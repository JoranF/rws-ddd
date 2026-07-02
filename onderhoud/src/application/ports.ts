import type { KunstwerkId } from '../domain/gedeeld/waarden';
import type { OnderhoudDomainEvent } from '../domain/gedeeld/domain-events';

export const EVENT_PUBLISHER = 'EVENT_PUBLISHER';
export const KUNSTWERKEN_READ_MODEL = 'KUNSTWERKEN_READ_MODEL';
export const CONTRACTEN_READ_MODEL = 'CONTRACTEN_READ_MODEL';
export const ID_GENERATOR = 'ID_GENERATOR';

export interface EventPublisher {
  publiceer(events: OnderhoudDomainEvent[]): Promise<void>;
}

export interface KunstwerkenReadModel {
  isBekendEnInGebruik(id: KunstwerkId): Promise<boolean>;
}

export interface ContractenReadModel {
  geldendContractVoor(id: KunstwerkId): Promise<{ contractId: string; opdrachtnemer: string } | null>;
}

export interface IdGenerator {
  nieuw(): string;
}
