import { Bedrag, Contractperiode, ContractId } from '../../domain/gedeeld/waarden.js';
import { DomeinFout } from '../../domain/gedeeld/fouten.js';
import type { EventPublisher, IdGenerator, KpiBron, OnderhoudscontractRepository } from '../ports.js';

export interface StelPrestatieverklaringOpCommand {
  contractId: string;
  periodeStart: string;
  periodeEind: string;
  score?: number;
  bedrag: number;
}

export class StelPrestatieverklaringOp {
  constructor(
    private readonly repo: OnderhoudscontractRepository,
    private readonly publisher: EventPublisher,
    private readonly ids: IdGenerator,
    // Fase 2 (conformist): voedt de score uit de laatste Monitoring-KPI als er geen is meegegeven.
    private readonly kpiBron?: KpiBron,
  ) {}

  async uitvoeren(command: StelPrestatieverklaringOpCommand): Promise<void> {
    const contract = await this.repo.zoek(ContractId.van(command.contractId));
    if (!contract) throw new DomeinFout('contract niet gevonden');

    let score = command.score;
    if (score === undefined && this.kpiBron) {
      const kpi = await this.kpiBron.laatsteKpiScore(contract.kunstwerkId.waarde);
      if (kpi !== null) score = kpi;
    }
    if (score === undefined) throw new DomeinFout('geen score opgegeven en geen KPI-data beschikbaar');

    contract.stelPrestatieverklaringOp({
      id: this.ids.nieuw(),
      periode: Contractperiode.van(new Date(command.periodeStart), new Date(command.periodeEind)),
      score,
      bedrag: Bedrag.vanEuro(command.bedrag),
    });
    await this.repo.bewaar(contract);
    await this.publisher.publiceer(contract.trekEventsLeeg());
  }
}
