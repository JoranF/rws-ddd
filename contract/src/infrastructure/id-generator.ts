import { v4 as uuid } from 'uuid';
import type { IdGenerator } from '../application/ports.js';

export class UuidIdGenerator implements IdGenerator {
  nieuw(): string { return uuid(); }
}
