import { Bedrag, Contractperiode, ContractId } from '../../domain/gedeeld/waarden.js';
import { DomeinFout } from '../../domain/gedeeld/fouten.js';
import type { EventPublisher, IdGenerator, OnderhoudscontractRepository } from '../ports.js';

export interface StelPrestatieverklaringOpCommand {
  contractId: string;
  periodeStart: string;
  periodeEind: string;
  score: number;
  bedrag: number;
}

export class StelPrestatieverklaringOp {
  constructor(
    private readonly repo: OnderhoudscontractRepository,
    private readonly publisher: EventPublisher,
    private readonly ids: IdGenerator,
  ) {}

  async uitvoeren(command: StelPrestatieverklaringOpCommand): Promise<void> {
    const contract = await this.repo.zoek(ContractId.van(command.contractId));
    if (!contract) throw new DomeinFout('contract niet gevonden');
    contract.stelPrestatieverklaringOp({
      id: this.ids.nieuw(),
      periode: Contractperiode.van(new Date(command.periodeStart), new Date(command.periodeEind)),
      score: command.score,
      bedrag: Bedrag.vanEuro(command.bedrag),
    });
    await this.repo.bewaar(contract);
    await this.publisher.publiceer(contract.trekEventsLeeg());
  }
}
