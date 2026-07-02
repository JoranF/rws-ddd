import { ContractId, OnderhoudId } from '../../domain/gedeeld/waarden';
import { DomeinFout } from '../../domain/gedeeld/fouten';
import type { OnderhoudRepository } from '../../domain/repositories';
import type { ContractenReadModel, EventPublisher } from '../ports';

export interface StartOnderhoudCommand {
  onderhoudId: string;
  datum: string;
}

export class StartOnderhoud {
  constructor(
    private readonly onderhouden: OnderhoudRepository,
    private readonly contracten: ContractenReadModel,
    private readonly publisher: EventPublisher,
    private readonly validatie: 'soepel' | 'streng',
  ) {}

  async uitvoeren(command: StartOnderhoudCommand): Promise<void> {
    const traject = await this.onderhouden.zoek(OnderhoudId.van(command.onderhoudId));
    if (!traject) throw new DomeinFout('onderhoudstraject niet gevonden');

    const contract = await this.contracten.geldendContractVoor(traject.kunstwerkId);
    if (!contract) {
      if (this.validatie === 'streng') throw new DomeinFout('geen geldend onderhoudscontract voor dit kunstwerk');
      console.warn(`geen geldend contract voor kunstwerk ${traject.kunstwerkId.waarde} — soepele validatie, start gaat door`);
    }

    traject.start({
      datum: new Date(command.datum),
      contractId: contract ? ContractId.van(contract.contractId) : undefined,
    });
    await this.onderhouden.bewaar(traject);
    await this.publisher.publiceer(traject.trekEventsLeeg());
  }
}
