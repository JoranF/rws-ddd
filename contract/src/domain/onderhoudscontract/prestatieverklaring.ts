import type { Bedrag, Contractperiode } from '../gedeeld/waarden.js';

export interface Prestatieverklaring {
  id: string;
  periode: Contractperiode;
  score: number;
  bedrag: Bedrag;
}
