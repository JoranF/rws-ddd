import type { Storing } from './storing/storing';
import type { Onderhoud } from './onderhoud/onderhoud';
import type { OnderhoudsSchema } from './schema/onderhouds-schema';
import type { KunstwerkId, OnderhoudId, SchemaId, StoringId } from './gedeeld/waarden';

export const STORING_REPOSITORY = 'STORING_REPOSITORY';
export const ONDERHOUD_REPOSITORY = 'ONDERHOUD_REPOSITORY';
export const SCHEMA_REPOSITORY = 'SCHEMA_REPOSITORY';

export interface StoringRepository {
  bewaar(s: Storing): Promise<void>;
  zoek(id: StoringId): Promise<Storing | null>;
  zoekAlle(): Promise<Storing[]>;
}

export interface OnderhoudRepository {
  bewaar(o: Onderhoud): Promise<void>;
  zoek(id: OnderhoudId): Promise<Onderhoud | null>;
  zoekAlle(): Promise<Onderhoud[]>;
  zoekPerKunstwerk(kunstwerkId: KunstwerkId): Promise<Onderhoud[]>;
}

export interface SchemaRepository {
  bewaar(s: OnderhoudsSchema): Promise<void>;
  zoek(id: SchemaId): Promise<OnderhoudsSchema | null>;
  zoekAlle(): Promise<OnderhoudsSchema[]>;
}
