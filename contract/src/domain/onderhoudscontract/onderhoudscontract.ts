import { AggregateRoot } from '../gedeeld/aggregate-root.js';
import { DomeinFout } from '../gedeeld/fouten.js';
import { AanbestedingId, Aannemer, Bedrag, Contractperiode, ContractId, KunstwerkId } from '../gedeeld/waarden.js';
import type { Wijziging, WijzigingSoort } from './wijziging.js';
import type { Prestatieverklaring } from './prestatieverklaring.js';

export type ContractStatus = 'Actief' | 'Afgerond';

interface HerstelData {
  id: ContractId;
  kunstwerkId: KunstwerkId;
  opdrachtnemer: Aannemer;
  looptijd: Contractperiode;
  waarde: Bedrag;
  aanbestedingId?: AanbestedingId;
  status: ContractStatus;
  wijzigingen: Wijziging[];
  prestatieverklaringen: Prestatieverklaring[];
}

export class Onderhoudscontract extends AggregateRoot {
  private constructor(
    private readonly _id: ContractId,
    private readonly _kunstwerkId: KunstwerkId,
    private readonly opdrachtnemer: Aannemer,
    private readonly _looptijd: Contractperiode,
    private _waarde: Bedrag,
    private readonly _aanbestedingId: AanbestedingId | undefined,
    private _status: ContractStatus,
    private readonly wijzigingen: Wijziging[],
    private readonly prestatieverklaringen: Prestatieverklaring[],
  ) {
    super();
  }

  static gun(p: {
    id: ContractId;
    kunstwerkId: KunstwerkId;
    opdrachtnemer: Aannemer;
    looptijd: Contractperiode;
    waarde: Bedrag;
    aanbestedingId?: AanbestedingId;
  }): Onderhoudscontract {
    const c = new Onderhoudscontract(p.id, p.kunstwerkId, p.opdrachtnemer, p.looptijd, p.waarde, p.aanbestedingId, 'Actief', [], []);
    c.registreerEvent({
      eventType: 'contract.onderhoudscontract.gegund',
      data: {
        contractId: p.id.waarde,
        kunstwerkId: p.kunstwerkId.waarde,
        opdrachtnemer: p.opdrachtnemer.naam,
        looptijd: { start: p.looptijd.start.toISOString(), eind: p.looptijd.eind.toISOString() },
      },
    });
    return c;
  }

  static herstel(d: HerstelData): Onderhoudscontract {
    return new Onderhoudscontract(d.id, d.kunstwerkId, d.opdrachtnemer, d.looptijd, d.waarde, d.aanbestedingId, d.status, d.wijzigingen, d.prestatieverklaringen);
  }

  get id(): ContractId { return this._id; }
  get kunstwerkId(): KunstwerkId { return this._kunstwerkId; }
  get status(): ContractStatus { return this._status; }
  get waarde(): Bedrag { return this._waarde; }
  get opdrachtnemerNaam(): string { return this.opdrachtnemer.naam; }
  get looptijd(): Contractperiode { return this._looptijd; }
  get aanbestedingIdWaarde(): string | undefined { return this._aanbestedingId?.waarde; }
  get wijzigingenLijst(): readonly Wijziging[] { return this.wijzigingen; }
  get prestatiesLijst(): readonly Prestatieverklaring[] { return this.prestatieverklaringen; }

  private eisActief(): void {
    if (this._status !== 'Actief') throw new DomeinFout('actie kan alleen op een actief contract');
  }

  keurWijzigingGoed(p: { id: string; mutatie: Bedrag; soort: WijzigingSoort; reden: string; datum: Date }): void {
    this.eisActief();
    const nieuweWaarde = p.soort === 'Verhoging' ? this._waarde.plus(p.mutatie) : this._waarde.min(p.mutatie);
    this._waarde = nieuweWaarde;
    this.wijzigingen.push({ id: p.id, mutatie: p.mutatie, soort: p.soort, reden: p.reden, datum: p.datum });
    const gesigneerd = p.soort === 'Verhoging' ? p.mutatie.euro : -p.mutatie.euro;
    this.registreerEvent({
      eventType: 'contract.wijziging.goedgekeurd',
      data: { contractId: this._id.waarde, bedrag: gesigneerd, reden: p.reden, datum: p.datum.toISOString() },
    });
  }

  stelPrestatieverklaringOp(p: { id: string; periode: Contractperiode; score: number; bedrag: Bedrag }): void {
    this.eisActief();
    if (!this._looptijd.omvat(p.periode)) throw new DomeinFout('prestatieperiode valt buiten de looptijd');
    if (p.score < 0 || p.score > 100) throw new DomeinFout('score moet tussen 0 en 100 liggen');
    this.prestatieverklaringen.push({ id: p.id, periode: p.periode, score: p.score, bedrag: p.bedrag });
    this.registreerEvent({
      eventType: 'contract.prestatieverklaring.opgesteld',
      data: {
        contractId: this._id.waarde,
        periode: { start: p.periode.start.toISOString(), eind: p.periode.eind.toISOString() },
        score: p.score,
        bedrag: p.bedrag.euro,
      },
    });
  }

  rondAf(datum: Date): void {
    this.eisActief();
    this._status = 'Afgerond';
    this.registreerEvent({
      eventType: 'contract.onderhoudscontract.afgerond',
      data: { contractId: this._id.waarde, kunstwerkId: this._kunstwerkId.waarde, datum: datum.toISOString() },
    });
  }
}
