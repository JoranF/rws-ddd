import { AggregateRoot } from '../gedeeld/aggregate-root';
import { DomeinFout } from '../gedeeld/fouten';
import type { AannemerId, Bedrag, ContractId, FactuurId, InspectieId, KunstwerkId, OnderhoudId, StoringId } from '../gedeeld/waarden';
import type { Diagnose } from '../diagnose/diagnose';

export type OnderhoudStatus = 'Gepland' | 'Gestart' | 'Afgerond';

export type Aanleiding =
  | { soort: 'Storing'; storingId: StoringId }
  | { soort: 'Diagnose'; diagnose: Diagnose };

export type InspectieOordeel = 'Goedgekeurd' | 'Afgekeurd';
export interface Inspectie {
  id: InspectieId;
  datum: Date;
  oordeel: InspectieOordeel;
  opmerkingen?: string;
}

export type FactuurStatus = 'Ontvangen' | 'Goedgekeurd' | 'Afgekeurd';
export interface Factuur {
  id: FactuurId;
  bedrag: Bedrag;
  status: FactuurStatus;
  ontvangenOp: Date;
}

interface HerstelData {
  id: OnderhoudId;
  kunstwerkId: KunstwerkId;
  aanleiding: Aanleiding;
  status: OnderhoudStatus;
  contractId?: ContractId;
  aannemerId?: AannemerId;
  gestartOp?: Date;
  afgerondOp?: Date;
  resultaat?: string;
  inspecties: Inspectie[];
  facturen: Factuur[];
}

export class Onderhoud extends AggregateRoot {
  private constructor(
    private readonly _id: OnderhoudId,
    private readonly _kunstwerkId: KunstwerkId,
    private readonly _aanleiding: Aanleiding,
    private _status: OnderhoudStatus,
    private _contractId: ContractId | undefined,
    private _aannemerId: AannemerId | undefined,
    private _gestartOp: Date | undefined,
    private _afgerondOp: Date | undefined,
    private _resultaat: string | undefined,
    private readonly _inspecties: Inspectie[],
    private readonly _facturen: Factuur[],
  ) {
    super();
  }

  static plan(p: { id: OnderhoudId; kunstwerkId: KunstwerkId; aanleiding: Aanleiding }): Onderhoud {
    return new Onderhoud(p.id, p.kunstwerkId, p.aanleiding, 'Gepland', undefined, undefined, undefined, undefined, undefined, [], []);
  }

  static herstel(d: HerstelData): Onderhoud {
    return new Onderhoud(d.id, d.kunstwerkId, d.aanleiding, d.status, d.contractId, d.aannemerId, d.gestartOp, d.afgerondOp, d.resultaat, d.inspecties, d.facturen);
  }

  get id(): OnderhoudId { return this._id; }
  get kunstwerkId(): KunstwerkId { return this._kunstwerkId; }
  get aanleiding(): Aanleiding { return this._aanleiding; }
  get status(): OnderhoudStatus { return this._status; }
  get contractId(): ContractId | undefined { return this._contractId; }
  get aannemerId(): AannemerId | undefined { return this._aannemerId; }
  get gestartOp(): Date | undefined { return this._gestartOp; }
  get afgerondOp(): Date | undefined { return this._afgerondOp; }
  get resultaat(): string | undefined { return this._resultaat; }
  get inspecties(): readonly Inspectie[] { return this._inspecties; }
  get facturen(): readonly Factuur[] { return this._facturen; }

  start(p: { datum: Date; contractId?: ContractId; aannemerId?: AannemerId }): void {
    if (this._status !== 'Gepland') throw new DomeinFout('alleen een gepland traject kan starten');
    this._status = 'Gestart';
    this._gestartOp = p.datum;
    this._contractId = p.contractId ?? this._contractId;
    this._aannemerId = p.aannemerId ?? this._aannemerId;
    this.registreerEvent({
      eventType: 'onderhoud.onderhoud.gestart',
      data: { onderhoudId: this._id.waarde, kunstwerkId: this._kunstwerkId.waarde, datum: p.datum.toISOString() },
    });
  }

  registreerInspectie(p: { id: InspectieId; datum: Date; oordeel: InspectieOordeel; opmerkingen?: string }): void {
    if (this._status !== 'Gestart') throw new DomeinFout('inspecteren kan alleen bij een gestart traject');
    this._inspecties.push({ id: p.id, datum: p.datum, oordeel: p.oordeel, opmerkingen: p.opmerkingen });
  }

  rondAf(p: { resultaat: string; datum: Date }): void {
    if (this._status !== 'Gestart') throw new DomeinFout('alleen een gestart traject kan afgerond worden');
    if (!this._inspecties.some((i) => i.oordeel === 'Goedgekeurd')) {
      throw new DomeinFout('afronden vereist een goedgekeurde inspectie');
    }
    this._status = 'Afgerond';
    this._afgerondOp = p.datum;
    this._resultaat = p.resultaat;
    this.registreerEvent({
      eventType: 'onderhoud.onderhoud.afgerond',
      data: { onderhoudId: this._id.waarde, kunstwerkId: this._kunstwerkId.waarde, resultaat: p.resultaat, datum: p.datum.toISOString() },
    });
  }

  ontvangFactuur(p: { id: FactuurId; bedrag: Bedrag; ontvangenOp: Date }): void {
    if (this._status === 'Gepland') throw new DomeinFout('een factuur hoort bij een gestart of afgerond traject');
    this._facturen.push({ id: p.id, bedrag: p.bedrag, status: 'Ontvangen', ontvangenOp: p.ontvangenOp });
  }

  keurFactuurGoed(factuurId: FactuurId): void {
    const factuur = this._facturen.find((f) => f.id.gelijkAan(factuurId));
    if (!factuur) throw new DomeinFout('factuur niet gevonden');
    if (this._status !== 'Afgerond') throw new DomeinFout('een factuur goedkeuren vereist een afgerond traject');
    factuur.status = 'Goedgekeurd';
  }
}
