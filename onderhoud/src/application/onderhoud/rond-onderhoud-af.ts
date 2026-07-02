import { OnderhoudId } from '../../domain/gedeeld/waarden';
import { DomeinFout } from '../../domain/gedeeld/fouten';
import type { OnderhoudRepository, StoringRepository } from '../../domain/repositories';
import type { EventPublisher } from '../ports';

export interface RondOnderhoudAfCommand {
  onderhoudId: string;
  resultaat: string;
  datum: string;
}

export class RondOnderhoudAf {
  constructor(
    private readonly onderhouden: OnderhoudRepository,
    private readonly storingen: StoringRepository,
    private readonly publisher: EventPublisher,
  ) {}

  async uitvoeren(command: RondOnderhoudAfCommand): Promise<void> {
    const traject = await this.onderhouden.zoek(OnderhoudId.van(command.onderhoudId));
    if (!traject) throw new DomeinFout('onderhoudstraject niet gevonden');

    traject.rondAf({ resultaat: command.resultaat, datum: new Date(command.datum) });
    await this.onderhouden.bewaar(traject);

    if (traject.aanleiding.soort === 'Storing') {
      const storing = await this.storingen.zoek(traject.aanleiding.storingId);
      if (storing && storing.status !== 'Afgehandeld') {
        storing.handelAf();
        await this.storingen.bewaar(storing);
      }
    }

    await this.publisher.publiceer(traject.trekEventsLeeg());
  }
}
