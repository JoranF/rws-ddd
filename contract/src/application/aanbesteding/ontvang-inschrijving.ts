import { Aannemer, AanbestedingId, Bedrag } from '../../domain/gedeeld/waarden.js';
import { DomeinFout } from '../../domain/gedeeld/fouten.js';
import type { AanbestedingRepository, EventPublisher, IdGenerator } from '../ports.js';

export interface OntvangInschrijvingCommand {
  aanbestedingId: string;
  aannemer: string;
  prijs: number;
  kwaliteitsscore: number;
}

export class OntvangInschrijving {
  constructor(
    private readonly repo: AanbestedingRepository,
    private readonly publisher: EventPublisher,
    private readonly ids: IdGenerator,
  ) {}

  async uitvoeren(command: OntvangInschrijvingCommand): Promise<void> {
    const aanbesteding = await this.repo.zoek(AanbestedingId.van(command.aanbestedingId));
    if (!aanbesteding) throw new DomeinFout('aanbesteding niet gevonden');
    aanbesteding.ontvangInschrijving({
      id: this.ids.nieuw(),
      aannemer: Aannemer.van(command.aannemer),
      prijs: Bedrag.vanEuro(command.prijs),
      kwaliteitsscore: command.kwaliteitsscore,
    });
    await this.repo.bewaar(aanbesteding);
    await this.publisher.publiceer(aanbesteding.trekEventsLeeg());
  }
}
