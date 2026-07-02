import { FactuurId, OnderhoudId } from '../../domain/gedeeld/waarden';
import { DomeinFout } from '../../domain/gedeeld/fouten';
import type { OnderhoudRepository } from '../../domain/repositories';

export interface KeurFactuurGoedCommand {
  onderhoudId: string;
  factuurId: string;
}

export class KeurFactuurGoed {
  constructor(private readonly onderhouden: OnderhoudRepository) {}

  async uitvoeren(command: KeurFactuurGoedCommand): Promise<void> {
    const traject = await this.onderhouden.zoek(OnderhoudId.van(command.onderhoudId));
    if (!traject) throw new DomeinFout('onderhoudstraject niet gevonden');
    traject.keurFactuurGoed(FactuurId.van(command.factuurId));
    await this.onderhouden.bewaar(traject);
  }
}
