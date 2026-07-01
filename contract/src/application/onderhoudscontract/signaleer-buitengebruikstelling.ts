import { KunstwerkId } from '../../domain/gedeeld/waarden.js';
import type { OnderhoudscontractRepository } from '../ports.js';

export interface SignaleerBuitengebruikstellingCommand {
  kunstwerkId: string;
}

/**
 * Fase 2 — reageer op `beheer.kunstwerk.buitengebruikgesteld`: signaleer de nog
 * actieve contracten op dat kunstwerk (context-map: Contract = customer van Beheer).
 * We publiceren geen nieuw event (geen contract in events.md); we signaleren via de log
 * en geven de getroffen contract-ID's terug zodat de beheerder kan ingrijpen.
 */
export class SignaleerBuitengebruikstelling {
  constructor(
    private readonly contracten: OnderhoudscontractRepository,
    private readonly log: (bericht: string) => void = console.warn,
  ) {}

  async uitvoeren(command: SignaleerBuitengebruikstellingCommand): Promise<{ getroffenContracten: string[] }> {
    const alle = await this.contracten.zoekPerKunstwerk(KunstwerkId.van(command.kunstwerkId));
    const getroffenContracten = alle.filter((c) => c.status === 'Actief').map((c) => c.id.waarde);
    if (getroffenContracten.length > 0) {
      this.log(
        `kunstwerk ${command.kunstwerkId} is buiten gebruik gesteld — ${getroffenContracten.length} actief(e) contract(en) geraakt: ${getroffenContracten.join(', ')}`,
      );
    }
    return { getroffenContracten };
  }
}
