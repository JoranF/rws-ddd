import { Bedrag, FactuurId, OnderhoudId } from '../../domain/gedeeld/waarden';
import { DomeinFout } from '../../domain/gedeeld/fouten';
import type { OnderhoudRepository } from '../../domain/repositories';
import type { IdGenerator } from '../ports';

export interface OntvangFactuurCommand {
  onderhoudId: string;
  bedragEuro: number;
  ontvangenOp: string;
}

export class OntvangFactuur {
  constructor(
    private readonly onderhouden: OnderhoudRepository,
    private readonly ids: IdGenerator,
  ) {}

  async uitvoeren(command: OntvangFactuurCommand): Promise<{ factuurId: string }> {
    const traject = await this.onderhouden.zoek(OnderhoudId.van(command.onderhoudId));
    if (!traject) throw new DomeinFout('onderhoudstraject niet gevonden');
    const factuurId = FactuurId.van(this.ids.nieuw());
    traject.ontvangFactuur({ id: factuurId, bedrag: Bedrag.vanEuro(command.bedragEuro), ontvangenOp: new Date(command.ontvangenOp) });
    await this.onderhouden.bewaar(traject);
    return { factuurId: factuurId.waarde };
  }
}
