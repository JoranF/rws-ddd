import { Onderhoudscontract } from '../../domain/onderhoudscontract/onderhoudscontract.js';
import { AanbestedingId, Contractperiode, ContractId } from '../../domain/gedeeld/waarden.js';
import { DomeinFout } from '../../domain/gedeeld/fouten.js';
import type {
  AanbestedingRepository,
  EventPublisher,
  IdGenerator,
  KunstwerkenReadModel,
  OnderhoudscontractRepository,
} from '../ports.js';

export interface GunAanbestedingCommand {
  aanbestedingId: string;
  looptijdStart: string;
  looptijdEind: string;
}

export class GunAanbesteding {
  constructor(
    private readonly aanbestedingen: AanbestedingRepository,
    private readonly contracten: OnderhoudscontractRepository,
    private readonly publisher: EventPublisher,
    private readonly kunstwerken: KunstwerkenReadModel,
    private readonly ids: IdGenerator,
    private readonly validatie: 'soepel' | 'streng',
  ) {}

  async uitvoeren(command: GunAanbestedingCommand): Promise<{ contractId: string }> {
    const aanbesteding = await this.aanbestedingen.zoek(AanbestedingId.van(command.aanbestedingId));
    if (!aanbesteding) throw new DomeinFout('aanbesteding niet gevonden');

    const bekend = await this.kunstwerken.isBekendEnInGebruik(aanbesteding.kunstwerkId);
    if (!bekend) {
      if (this.validatie === 'streng') throw new DomeinFout('kunstwerk onbekend of buiten gebruik');
      // soepel: doorgaan (Fase 1); een waarschuwing is voldoende
      console.warn(`kunstwerk ${aanbesteding.kunstwerkId.waarde} onbekend in read-model — soepele validatie, gunning gaat door`);
    }

    const uitslag = aanbesteding.gun();
    await this.aanbestedingen.bewaar(aanbesteding);

    const contractId = ContractId.van(this.ids.nieuw());
    const contract = Onderhoudscontract.gun({
      id: contractId,
      kunstwerkId: aanbesteding.kunstwerkId,
      opdrachtnemer: uitslag.winnaar,
      looptijd: Contractperiode.van(new Date(command.looptijdStart), new Date(command.looptijdEind)),
      waarde: uitslag.winnendePrijs,
      aanbestedingId: aanbesteding.id,
    });
    await this.contracten.bewaar(contract);

    await this.publisher.publiceer([...aanbesteding.trekEventsLeeg(), ...contract.trekEventsLeeg()]);
    return { contractId: contractId.waarde };
  }
}
