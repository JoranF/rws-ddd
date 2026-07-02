import { Bedrag, ContractId } from '../../domain/gedeeld/waarden.js';
import { DomeinFout } from '../../domain/gedeeld/fouten.js';
import type { WijzigingSoort } from '../../domain/onderhoudscontract/wijziging.js';
import type { EventPublisher, IdGenerator, OnderhoudscontractRepository } from '../ports.js';

export interface KeurWijzigingGoedCommand {
  contractId: string;
  bedrag: number;
  soort: WijzigingSoort;
  reden: string;
  datum: string;
}

export class KeurWijzigingGoed {
  constructor(
    private readonly repo: OnderhoudscontractRepository,
    private readonly publisher: EventPublisher,
    private readonly ids: IdGenerator,
  ) {}

  async uitvoeren(command: KeurWijzigingGoedCommand): Promise<void> {
    const contract = await this.repo.zoek(ContractId.van(command.contractId));
    if (!contract) throw new DomeinFout('contract niet gevonden');
    contract.keurWijzigingGoed({
      id: this.ids.nieuw(),
      mutatie: Bedrag.vanEuro(command.bedrag),
      soort: command.soort,
      reden: command.reden,
      datum: new Date(command.datum),
    });
    await this.repo.bewaar(contract);
    await this.publisher.publiceer(contract.trekEventsLeeg());
  }
}
