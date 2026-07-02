import { DomeinFout } from './fouten';

abstract class Identiteit {
  protected constructor(readonly waarde: string) {}
  gelijkAan(andere: Identiteit): boolean {
    return this.constructor === andere.constructor && this.waarde === andere.waarde;
  }
}

function eisNietLeeg(waarde: string, veld: string): string {
  if (!waarde || waarde.trim() === '') throw new DomeinFout(`${veld} mag niet leeg zijn`);
  return waarde;
}

export class StoringId extends Identiteit {
  static van(waarde: string): StoringId {
    return new StoringId(eisNietLeeg(waarde, 'storingId'));
  }
}
export class OnderhoudId extends Identiteit {
  static van(waarde: string): OnderhoudId {
    return new OnderhoudId(eisNietLeeg(waarde, 'onderhoudId'));
  }
}
export class SchemaId extends Identiteit {
  static van(waarde: string): SchemaId {
    return new SchemaId(eisNietLeeg(waarde, 'schemaId'));
  }
}
export class FactuurId extends Identiteit {
  static van(waarde: string): FactuurId {
    return new FactuurId(eisNietLeeg(waarde, 'factuurId'));
  }
}
export class InspectieId extends Identiteit {
  static van(waarde: string): InspectieId {
    return new InspectieId(eisNietLeeg(waarde, 'inspectieId'));
  }
}
export class KunstwerkId extends Identiteit {
  static van(waarde: string): KunstwerkId {
    return new KunstwerkId(eisNietLeeg(waarde, 'kunstwerkId'));
  }
}
export class ContractId extends Identiteit {
  static van(waarde: string): ContractId {
    return new ContractId(eisNietLeeg(waarde, 'contractId'));
  }
}
export class IncidentId extends Identiteit {
  static van(waarde: string): IncidentId {
    return new IncidentId(eisNietLeeg(waarde, 'incidentId'));
  }
}
export class AannemerId extends Identiteit {
  static van(waarde: string): AannemerId {
    return new AannemerId(eisNietLeeg(waarde, 'aannemerId'));
  }
}

const ERNST_NIVEAUS = ['Laag', 'Middel', 'Hoog', 'Kritiek'] as const;
export type Ernst = (typeof ERNST_NIVEAUS)[number];

export function ernstVan(waarde: string): Ernst {
  if (!(ERNST_NIVEAUS as readonly string[]).includes(waarde)) {
    throw new DomeinFout(`onbekende ernst: ${waarde} (verwacht: ${ERNST_NIVEAUS.join('/')})`);
  }
  return waarde as Ernst;
}

export class Bedrag {
  private constructor(readonly centen: number, readonly valuta: string) {}

  static vanCenten(centen: number, valuta = 'EUR'): Bedrag {
    if (!Number.isInteger(centen)) throw new DomeinFout('centen moet een geheel getal zijn');
    if (centen < 0) throw new DomeinFout('bedrag mag niet negatief zijn');
    return new Bedrag(centen, valuta);
  }
  static vanEuro(euro: number, valuta = 'EUR'): Bedrag {
    return Bedrag.vanCenten(Math.round(euro * 100), valuta);
  }
  get euro(): number {
    return this.centen / 100;
  }
}

export class Periode {
  private constructor(readonly start: Date, readonly eind: Date) {}
  static van(start: Date, eind: Date): Periode {
    if (eind.getTime() <= start.getTime()) throw new DomeinFout('eind moet na start liggen');
    return new Periode(start, eind);
  }
  bevat(datum: Date): boolean {
    return datum.getTime() >= this.start.getTime() && datum.getTime() <= this.eind.getTime();
  }
}
