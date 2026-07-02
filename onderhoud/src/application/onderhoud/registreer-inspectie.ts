import { InspectieId, OnderhoudId } from '../../domain/gedeeld/waarden';
import { DomeinFout } from '../../domain/gedeeld/fouten';
import type { InspectieOordeel } from '../../domain/onderhoud/onderhoud';
import type { OnderhoudRepository } from '../../domain/repositories';
import type { IdGenerator } from '../ports';

export interface RegistreerInspectieCommand {
  onderhoudId: string;
  datum: string;
  oordeel: InspectieOordeel;
  opmerkingen?: string;
}

export class RegistreerInspectie {
  constructor(
    private readonly onderhouden: OnderhoudRepository,
    private readonly ids: IdGenerator,
  ) {}

  async uitvoeren(command: RegistreerInspectieCommand): Promise<void> {
    const traject = await this.onderhouden.zoek(OnderhoudId.van(command.onderhoudId));
    if (!traject) throw new DomeinFout('onderhoudstraject niet gevonden');
    traject.registreerInspectie({
      id: InspectieId.van(this.ids.nieuw()),
      datum: new Date(command.datum),
      oordeel: command.oordeel,
      opmerkingen: command.opmerkingen,
    });
    await this.onderhouden.bewaar(traject);
  }
}
