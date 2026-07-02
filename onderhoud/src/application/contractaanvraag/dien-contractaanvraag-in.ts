import { KunstwerkId } from '../../domain/gedeeld/waarden';
import { DomeinFout } from '../../domain/gedeeld/fouten';
import type { EventPublisher } from '../ports';

export interface DienContractaanvraagInCommand {
  kunstwerkId: string;
  aanleiding: string;
}

export class DienContractaanvraagIn {
  constructor(private readonly publisher: EventPublisher) {}

  async uitvoeren(command: DienContractaanvraagInCommand): Promise<void> {
    const kunstwerkId = KunstwerkId.van(command.kunstwerkId);
    if (!command.aanleiding || command.aanleiding.trim() === '') throw new DomeinFout('aanleiding mag niet leeg zijn');
    await this.publisher.publiceer([
      {
        eventType: 'onderhoud.contractaanvraag.ingediend',
        data: { kunstwerkId: kunstwerkId.waarde, aanleiding: command.aanleiding },
      },
    ]);
  }
}
