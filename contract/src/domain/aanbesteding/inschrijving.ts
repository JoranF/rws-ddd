import type { Aannemer, Bedrag } from '../gedeeld/waarden.js';

export interface Inschrijving {
  id: string;
  aannemer: Aannemer;
  prijs: Bedrag;
  kwaliteitsscore: number;
}
