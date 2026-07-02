import type { StelDiagnose } from '../../application/diagnose/stel-diagnose';
import type { Envelope, EventDedup } from './consumer-helpers';

export class MonitoringIncidentVerwerker {
  constructor(
    private readonly stelDiagnose: StelDiagnose,
    private readonly dedup: EventDedup,
  ) {}

  async verwerk(env: Envelope): Promise<void> {
    if (env.eventType !== 'monitoring.incident.aangemaakt') return;
    if (await this.dedup.isVerwerkt(env.eventId)) return;
    const kunstwerkId = String(env.data.kunstwerkId ?? '');
    if (kunstwerkId === '') return;
    await this.stelDiagnose.uitvoeren({
      kunstwerkId,
      incidentId: env.data.incidentId ? String(env.data.incidentId) : undefined,
      bevinding: String(env.data.omschrijving ?? 'incident uit monitoring'),
      ernst: String(env.data.ernst ?? 'Laag'),
    });
    await this.dedup.markeerVerwerkt(env.eventId);
  }
}

export const MONITORING_QUEUE = 'onderhoud.monitoring-incident';
export const MONITORING_BINDINGS = ['monitoring.incident.aangemaakt'];
