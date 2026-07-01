import { AggregateRoot } from '../gedeeld/aggregate-root.js';
import { DomeinFout } from '../gedeeld/fouten.js';
import { AanbestedingId, Aannemer, Bedrag, Gunningscriteria, KunstwerkId } from '../gedeeld/waarden.js';
import type { Inschrijving } from './inschrijving.js';

export type AanbestedingStatus = 'Gepubliceerd' | 'Gegund';

interface HerstelData {
  id: AanbestedingId;
  kunstwerkId: KunstwerkId;
  sluitingsdatum: Date;
  criteria: Gunningscriteria;
  status: AanbestedingStatus;
  inschrijvingen: Inschrijving[];
}

export class Aanbesteding extends AggregateRoot {
  private constructor(
    private readonly _id: AanbestedingId,
    private readonly _kunstwerkId: KunstwerkId,
    private readonly sluitingsdatumWaarde: Date,
    private readonly criteriaWaarde: Gunningscriteria,
    private _status: AanbestedingStatus,
    private readonly _inschrijvingen: Inschrijving[],
  ) {
    super();
  }

  static publiceer(p: {
    id: AanbestedingId;
    kunstwerkId: KunstwerkId;
    sluitingsdatum: Date;
    criteria: Gunningscriteria;
  }): Aanbesteding {
    const a = new Aanbesteding(p.id, p.kunstwerkId, p.sluitingsdatum, p.criteria, 'Gepubliceerd', []);
    a.registreerEvent({
      eventType: 'contract.aanbesteding.gepubliceerd',
      data: {
        aanbestedingId: p.id.waarde,
        kunstwerkId: p.kunstwerkId.waarde,
        sluitingsdatum: p.sluitingsdatum.toISOString(),
        gunningscriteria: { prijsgewicht: p.criteria.prijsgewicht, kwaliteitsgewicht: p.criteria.kwaliteitsgewicht },
      },
    });
    return a;
  }

  static herstel(d: HerstelData): Aanbesteding {
    return new Aanbesteding(d.id, d.kunstwerkId, d.sluitingsdatum, d.criteria, d.status, d.inschrijvingen);
  }

  get id(): AanbestedingId { return this._id; }
  get kunstwerkId(): KunstwerkId { return this._kunstwerkId; }
  get status(): AanbestedingStatus { return this._status; }
  get inschrijvingen(): readonly Inschrijving[] { return this._inschrijvingen; }
  get sluitingsdatum(): Date { return this.sluitingsdatumWaarde; }
  get criteria(): Gunningscriteria { return this.criteriaWaarde; }

  ontvangInschrijving(inschrijving: Inschrijving): void {
    if (this._status !== 'Gepubliceerd') throw new DomeinFout('inschrijven kan alleen bij een gepubliceerde aanbesteding');
    this._inschrijvingen.push(inschrijving);
    this.registreerEvent({
      eventType: 'contract.inschrijving.ontvangen',
      data: {
        aanbestedingId: this._id.waarde,
        aannemer: inschrijving.aannemer.naam,
        prijs: inschrijving.prijs.euro,
        kwaliteitsscore: inschrijving.kwaliteitsscore,
      },
    });
  }

  gun(): { winnaar: Aannemer; emviScore: number; winnendePrijs: Bedrag } {
    if (this._status !== 'Gepubliceerd') throw new DomeinFout('aanbesteding is al gegund');
    if (this._inschrijvingen.length === 0) throw new DomeinFout('gunnen vereist minstens één inschrijving');

    const laagstePrijs = Math.min(...this._inschrijvingen.map((i) => i.prijs.centen));
    const gescoord = this._inschrijvingen.map((i) => ({
      inschrijving: i,
      emvi: this.emviScore(i, laagstePrijs),
    }));
    gescoord.sort((a, b) => b.emvi - a.emvi);
    const winnaar = gescoord[0];

    this._status = 'Gegund';
    this.registreerEvent({
      eventType: 'contract.aanbesteding.gegund',
      data: {
        aanbestedingId: this._id.waarde,
        winnendeAannemer: winnaar.inschrijving.aannemer.naam,
        emviScore: winnaar.emvi,
      },
    });
    return { winnaar: winnaar.inschrijving.aannemer, emviScore: winnaar.emvi, winnendePrijs: winnaar.inschrijving.prijs };
  }

  private emviScore(i: Inschrijving, laagstePrijs: number): number {
    const prijsScore = (laagstePrijs / i.prijs.centen) * 100;
    return (prijsScore * this.criteriaWaarde.prijsgewicht + i.kwaliteitsscore * this.criteriaWaarde.kwaliteitsgewicht) / 100;
  }
}
