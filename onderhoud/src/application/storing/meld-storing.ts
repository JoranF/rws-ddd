import { Storing } from '../../domain/storing/storing';
import { Onderhoud } from '../../domain/onderhoud/onderhoud';
import { vereistOnderhoud } from '../../domain/diagnose/diagnose';
import { ernstVan, KunstwerkId, OnderhoudId, StoringId } from '../../domain/gedeeld/waarden';
import { DomeinFout } from '../../domain/gedeeld/fouten';
import type { OnderhoudRepository, StoringRepository } from '../../domain/repositories';
import type { EventPublisher, IdGenerator, KunstwerkenReadModel } from '../ports';

export interface MeldStoringCommand {
  kunstwerkId: string;
  omschrijving: string;
  ernst: string;
}

export class MeldStoring {
  constructor(
    private readonly storingen: StoringRepository,
    private readonly onderhouden: OnderhoudRepository,
    private readonly publisher: EventPublisher,
    private readonly kunstwerken: KunstwerkenReadModel,
    private readonly ids: IdGenerator,
    private readonly validatie: 'soepel' | 'streng',
  ) {}

  async uitvoeren(command: MeldStoringCommand): Promise<{ storingId: string; onderhoudId?: string }> {
    const kunstwerkId = KunstwerkId.van(command.kunstwerkId);
    const ernst = ernstVan(command.ernst);

    const bekend = await this.kunstwerken.isBekendEnInGebruik(kunstwerkId);
    if (!bekend) {
      if (this.validatie === 'streng') throw new DomeinFout('kunstwerk onbekend of buiten gebruik');
      console.warn(`kunstwerk ${kunstwerkId.waarde} onbekend in read-model — soepele validatie, melding gaat door`);
    }

    const storing = Storing.meld({ id: StoringId.van(this.ids.nieuw()), kunstwerkId, omschrijving: command.omschrijving, ernst });

    let onderhoudId: string | undefined;
    if (vereistOnderhoud(ernst)) {
      const traject = Onderhoud.plan({
        id: OnderhoudId.van(this.ids.nieuw()),
        kunstwerkId,
        aanleiding: { soort: 'Storing', storingId: storing.id },
      });
      storing.koppelAanOnderhoud(traject.id);
      await this.onderhouden.bewaar(traject);
      onderhoudId = traject.id.waarde;
    }

    await this.storingen.bewaar(storing);
    await this.publisher.publiceer(storing.trekEventsLeeg());
    return { storingId: storing.id.waarde, onderhoudId };
  }
}
