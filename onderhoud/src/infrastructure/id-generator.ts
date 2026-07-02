import { Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import type { IdGenerator } from '../application/ports';

@Injectable()
export class UuidIdGenerator implements IdGenerator {
  nieuw(): string {
    return uuid();
  }
}
