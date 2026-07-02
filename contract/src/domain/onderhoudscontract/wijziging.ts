import type { Bedrag } from '../gedeeld/waarden.js';

export type WijzigingSoort = 'Verhoging' | 'Verlaging';

export interface Wijziging {
  id: string;
  mutatie: Bedrag;
  soort: WijzigingSoort;
  reden: string;
  datum: Date;
}
