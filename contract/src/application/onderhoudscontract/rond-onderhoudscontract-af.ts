import { ContractId } from '../../domain/gedeeld/waarden.js';
import { DomeinFout } from '../../domain/gedeeld/fouten.js';
import type { EventPublisher, OnderhoudscontractRepository } from '../ports.js';

export interface RondOnderhoudscontractAfCommand {
  contractId: string;
  datum: string;
}

export class RondOnderhoudscontractAf {
  constructor(
    private readonly repo: OnderhoudscontractRepository,
    private readonly publisher: EventPublisher,
  ) {}

  async uitvoeren(command: RondOnderhoudscontractAfCommand): Promise<void> {
    const contract = await this.repo.zoek(ContractId.van(command.contractId));
    if (!contract) throw new DomeinFout('contract niet gevonden');
    contract.rondAf(new Date(command.datum));
    await this.repo.bewaar(contract);
    await this.publisher.publiceer(contract.trekEventsLeeg());
  }
}
