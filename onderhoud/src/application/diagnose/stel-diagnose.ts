import { Onderhoud } from '../../domain/onderhoud/onderhoud';
import { vereistOnderhoud } from '../../domain/diagnose/diagnose';
import { ernstVan, IncidentId, KunstwerkId, OnderhoudId } from '../../domain/gedeeld/waarden';
import type { OnderhoudRepository } from '../../domain/repositories';
import type { IdGenerator } from '../ports';

export interface StelDiagnoseCommand {
  kunstwerkId: string;
  incidentId?: string;
  bevinding: string;
  ernst: string;
}

export class StelDiagnose {
  constructor(
    private readonly onderhouden: OnderhoudRepository,
    private readonly ids: IdGenerator,
  ) {}

  async uitvoeren(command: StelDiagnoseCommand): Promise<{ onderhoudId: string | null }> {
    const ernst = ernstVan(command.ernst);
    if (!vereistOnderhoud(ernst)) return { onderhoudId: null };

    const traject = Onderhoud.plan({
      id: OnderhoudId.van(this.ids.nieuw()),
      kunstwerkId: KunstwerkId.van(command.kunstwerkId),
      aanleiding: {
        soort: 'Diagnose',
        diagnose: {
          incidentId: command.incidentId ? IncidentId.van(command.incidentId) : undefined,
          bevinding: command.bevinding,
          ernst,
        },
      },
    });
    await this.onderhouden.bewaar(traject);
    return { onderhoudId: traject.id.waarde };
  }
}
