import { Aanbesteding } from '../../domain/aanbesteding/aanbesteding.js';
import { AanbestedingId, Gunningscriteria, KunstwerkId } from '../../domain/gedeeld/waarden.js';
import type { AanbestedingRepository, EventPublisher, IdGenerator } from '../ports.js';

export interface PubliceerAanbestedingCommand {
  kunstwerkId: string;
  sluitingsdatum: string;
  prijsgewicht: number;
  kwaliteitsgewicht: number;
}

export class PubliceerAanbesteding {
  constructor(
    private readonly repo: AanbestedingRepository,
    private readonly publisher: EventPublisher,
    private readonly ids: IdGenerator,
  ) {}

  async uitvoeren(command: PubliceerAanbestedingCommand): Promise<{ aanbestedingId: string }> {
    const id = AanbestedingId.van(this.ids.nieuw());
    const aanbesteding = Aanbesteding.publiceer({
      id,
      kunstwerkId: KunstwerkId.van(command.kunstwerkId),
      sluitingsdatum: new Date(command.sluitingsdatum),
      criteria: Gunningscriteria.van(command.prijsgewicht, command.kwaliteitsgewicht),
    });
    await this.repo.bewaar(aanbesteding);
    await this.publisher.publiceer(aanbesteding.trekEventsLeeg());
    return { aanbestedingId: id.waarde };
  }
}
