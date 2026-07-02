import { Prisma, type PrismaClient } from '@prisma/client';
import type { KpiInvoer, KpiStore } from '../messaging/monitoring-rapport-consumer.js';
import type { KpiBron } from '../../application/ports.js';

export class PrismaKpiReadModel implements KpiStore, KpiBron {
  constructor(private readonly prisma: PrismaClient) {}

  async bewaarKpi(invoer: KpiInvoer): Promise<void> {
    const resultaten = invoer.resultaten as Prisma.InputJsonValue;
    await this.prisma.kpiRapport.upsert({
      where: { id: invoer.id },
      create: {
        id: invoer.id,
        kunstwerkId: invoer.kunstwerkId,
        incidentId: invoer.incidentId ?? undefined,
        kpiScore: invoer.kpiScore ?? undefined,
        resultaten,
      },
      update: { kpiScore: invoer.kpiScore ?? undefined, resultaten },
    });
  }

  /** Laatste bekende KPI-score voor een kunstwerk (voedt de prestatieverklaring). */
  async laatsteKpiScore(kunstwerkId: string): Promise<number | null> {
    const rij = await this.prisma.kpiRapport.findFirst({
      where: { kunstwerkId, kpiScore: { not: null } },
      orderBy: { ontvangenOp: 'desc' },
    });
    return rij?.kpiScore ?? null;
  }
}
