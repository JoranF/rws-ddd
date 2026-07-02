import { beforeEach, describe, expect, it } from 'vitest';
import { Onderhoudscontract } from '../../src/domain/onderhoudscontract/onderhoudscontract.js';
import { Aannemer, Bedrag, Contractperiode, ContractId, KunstwerkId } from '../../src/domain/gedeeld/waarden.js';
import { StelPrestatieverklaringOp } from '../../src/application/onderhoudscontract/stel-prestatieverklaring-op.js';
import type { KpiBron } from '../../src/application/ports.js';
import { FakeEventPublisher, InMemoryOnderhoudscontractRepository, VasteIdGenerator } from '../support/fakes.js';

class FakeKpiBron implements KpiBron {
  constructor(private readonly score: number | null) {}
  async laatsteKpiScore(): Promise<number | null> { return this.score; }
}

describe('StelPrestatieverklaringOp met KPI-voeding (conformist op Monitoring)', () => {
  let repo: InMemoryOnderhoudscontractRepository;
  let publisher: FakeEventPublisher;

  beforeEach(async () => {
    repo = new InMemoryOnderhoudscontractRepository();
    publisher = new FakeEventPublisher();
    const c = Onderhoudscontract.gun({
      id: ContractId.van('C1'),
      kunstwerkId: KunstwerkId.van('KW1'),
      opdrachtnemer: Aannemer.van('BAM'),
      looptijd: Contractperiode.van(new Date('2026-01-01'), new Date('2026-12-31')),
      waarde: Bedrag.vanEuro(1000),
    });
    c.trekEventsLeeg();
    await repo.bewaar(c);
  });

  it('gebruikt de laatste KPI-score als er geen score is meegegeven', async () => {
    const uc = new StelPrestatieverklaringOp(repo, publisher, new VasteIdGenerator('P'), new FakeKpiBron(77));
    await uc.uitvoeren({ contractId: 'C1', periodeStart: '2026-01-01', periodeEind: '2026-06-30', bedrag: 500 });
    const event = publisher.gepubliceerd.find((e) => e.eventType === 'contract.prestatieverklaring.opgesteld');
    expect((event!.data as { score: number }).score).toBe(77);
  });

  it('respecteert een expliciete score boven de KPI-score', async () => {
    const uc = new StelPrestatieverklaringOp(repo, publisher, new VasteIdGenerator('P'), new FakeKpiBron(77));
    await uc.uitvoeren({ contractId: 'C1', periodeStart: '2026-01-01', periodeEind: '2026-06-30', score: 90, bedrag: 500 });
    const event = publisher.gepubliceerd.find((e) => e.eventType === 'contract.prestatieverklaring.opgesteld');
    expect((event!.data as { score: number }).score).toBe(90);
  });

  it('weigert als er geen score én geen KPI-data is', async () => {
    const uc = new StelPrestatieverklaringOp(repo, publisher, new VasteIdGenerator('P'), new FakeKpiBron(null));
    await expect(
      uc.uitvoeren({ contractId: 'C1', periodeStart: '2026-01-01', periodeEind: '2026-06-30', bedrag: 500 }),
    ).rejects.toThrow();
  });
});
