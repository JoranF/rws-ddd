import { DomeinFout } from './fouten.js';

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

export class KunstwerkId extends Identiteit {
  static van(waarde: string): KunstwerkId {
    return new KunstwerkId(eisNietLeeg(waarde, 'kunstwerkId'));
  }
}
export class AanbestedingId extends Identiteit {
  static van(waarde: string): AanbestedingId {
    return new AanbestedingId(eisNietLeeg(waarde, 'aanbestedingId'));
  }
}
export class ContractId extends Identiteit {
  static van(waarde: string): ContractId {
    return new ContractId(eisNietLeeg(waarde, 'contractId'));
  }
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
  private zelfdeValuta(b: Bedrag): void {
    if (b.valuta !== this.valuta) throw new DomeinFout('valuta komt niet overeen');
  }
  plus(b: Bedrag): Bedrag {
    this.zelfdeValuta(b);
    return Bedrag.vanCenten(this.centen + b.centen, this.valuta);
  }
  min(b: Bedrag): Bedrag {
    this.zelfdeValuta(b);
    return Bedrag.vanCenten(this.centen - b.centen, this.valuta);
  }
  isNegatief(): boolean {
    return this.centen < 0;
  }
}

export class Contractperiode {
  private constructor(readonly start: Date, readonly eind: Date) {}
  static van(start: Date, eind: Date): Contractperiode {
    if (eind.getTime() <= start.getTime()) throw new DomeinFout('eind moet na start liggen');
    return new Contractperiode(start, eind);
  }
  bevat(datum: Date): boolean {
    return datum.getTime() >= this.start.getTime() && datum.getTime() <= this.eind.getTime();
  }
  omvat(andere: Contractperiode): boolean {
    return this.bevat(andere.start) && this.bevat(andere.eind);
  }
}

export class Gunningscriteria {
  private constructor(readonly prijsgewicht: number, readonly kwaliteitsgewicht: number) {}
  static van(prijsgewicht: number, kwaliteitsgewicht: number): Gunningscriteria {
    if (prijsgewicht < 0 || kwaliteitsgewicht < 0) throw new DomeinFout('gewichten mogen niet negatief zijn');
    if (prijsgewicht + kwaliteitsgewicht !== 100) throw new DomeinFout('gewichten moeten samen 100 zijn');
    return new Gunningscriteria(prijsgewicht, kwaliteitsgewicht);
  }
}

export class Aannemer {
  private constructor(readonly naam: string, readonly identificatie?: string) {}
  static van(naam: string, identificatie?: string): Aannemer {
    return new Aannemer(eisNietLeeg(naam, 'aannemernaam'), identificatie);
  }
}
