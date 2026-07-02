import { AggregateRoot } from '../gedeeld/aggregate-root';
import { DomeinFout } from '../gedeeld/fouten';
import type { Ernst, KunstwerkId, OnderhoudId, StoringId } from '../gedeeld/waarden';

export type StoringStatus = 'Gemeld' | 'InBehandeling' | 'Afgehandeld';

interface HerstelData {
  id: StoringId;
  kunstwerkId: KunstwerkId;
  omschrijving: string;
  ernst: Ernst;
  status: StoringStatus;
  onderhoudId?: OnderhoudId;
}

export class Storing extends AggregateRoot {
  private constructor(
    private readonly _id: StoringId,
    private readonly _kunstwerkId: KunstwerkId,
    private readonly _omschrijving: string,
    private readonly _ernst: Ernst,
    private _status: StoringStatus,
    private _onderhoudId: OnderhoudId | undefined,
  ) {
    super();
  }

  static meld(p: { id: StoringId; kunstwerkId: KunstwerkId; omschrijving: string; ernst: Ernst }): Storing {
    if (!p.omschrijving || p.omschrijving.trim() === '') throw new DomeinFout('omschrijving mag niet leeg zijn');
    const s = new Storing(p.id, p.kunstwerkId, p.omschrijving, p.ernst, 'Gemeld', undefined);
    s.registreerEvent({
      eventType: 'onderhoud.storing.gemeld',
      data: { storingId: p.id.waarde, kunstwerkId: p.kunstwerkId.waarde, omschrijving: p.omschrijving },
    });
    return s;
  }

  static herstel(d: HerstelData): Storing {
    return new Storing(d.id, d.kunstwerkId, d.omschrijving, d.ernst, d.status, d.onderhoudId);
  }

  get id(): StoringId { return this._id; }
  get kunstwerkId(): KunstwerkId { return this._kunstwerkId; }
  get omschrijving(): string { return this._omschrijving; }
  get ernst(): Ernst { return this._ernst; }
  get status(): StoringStatus { return this._status; }
  get onderhoudId(): OnderhoudId | undefined { return this._onderhoudId; }

  koppelAanOnderhoud(onderhoudId: OnderhoudId): void {
    if (this._status === 'Afgehandeld') throw new DomeinFout('een afgehandelde storing kan niet meer gekoppeld worden');
    this._onderhoudId = onderhoudId;
    this._status = 'InBehandeling';
  }

  handelAf(): void {
    if (this._status === 'Afgehandeld') throw new DomeinFout('storing is al afgehandeld');
    this._status = 'Afgehandeld';
  }
}
