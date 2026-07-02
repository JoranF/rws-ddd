import { AggregateRoot } from '../gedeeld/aggregate-root';
import { DomeinFout } from '../gedeeld/fouten';
import type { ContractId, KunstwerkId, Periode, SchemaId } from '../gedeeld/waarden';

export interface GeplandMoment {
  datum: Date;
  omschrijving: string;
}

interface HerstelData {
  id: SchemaId;
  kunstwerkId: KunstwerkId;
  contractId: ContractId;
  aannemer: string;
  periode: Periode;
  momenten: GeplandMoment[];
}

export class OnderhoudsSchema extends AggregateRoot {
  private constructor(
    private readonly _id: SchemaId,
    private readonly _kunstwerkId: KunstwerkId,
    private readonly _contractId: ContractId,
    private readonly _aannemer: string,
    private readonly _periode: Periode,
    private readonly _momenten: GeplandMoment[],
  ) {
    super();
  }

  static maak(p: HerstelData): OnderhoudsSchema {
    if (p.momenten.length === 0) throw new DomeinFout('een schema heeft minstens één gepland moment');
    const s = new OnderhoudsSchema(p.id, p.kunstwerkId, p.contractId, p.aannemer, p.periode, []);
    for (const m of p.momenten) s.voegMomentToe(m);
    return s;
  }

  static herstel(d: HerstelData): OnderhoudsSchema {
    return new OnderhoudsSchema(d.id, d.kunstwerkId, d.contractId, d.aannemer, d.periode, d.momenten);
  }

  get id(): SchemaId { return this._id; }
  get kunstwerkId(): KunstwerkId { return this._kunstwerkId; }
  get contractId(): ContractId { return this._contractId; }
  get aannemer(): string { return this._aannemer; }
  get periode(): Periode { return this._periode; }
  get momenten(): readonly GeplandMoment[] { return this._momenten; }

  voegMomentToe(m: GeplandMoment): void {
    if (!this._periode.bevat(m.datum)) throw new DomeinFout('gepland moment valt buiten de schemaperiode');
    this._momenten.push(m);
  }
}
