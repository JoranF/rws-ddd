import { beforeEach, describe, expect, it } from 'vitest';
import { Onderhoudscontract } from '../../src/domain/onderhoudscontract/onderhoudscontract.js';
import { Aannemer, Bedrag, Contractperiode, ContractId, KunstwerkId } from '../../src/domain/gedeeld/waarden.js';
import { KeurWijzigingGoed } from '../../src/application/onderhoudscontract/keur-wijziging-goed.js';
import { StelPrestatieverklaringOp } from '../../src/application/onderhoudscontract/stel-prestatieverklaring-op.js';
import { RondOnderhoudscontractAf } from '../../src/application/onderhoudscontract/rond-onderhoudscontract-af.js';
import { FakeEventPublisher, InMemoryOnderhoudscontractRepository, VasteIdGenerator } from '../support/fakes.js';

describe('Onderhoudscontract-use-cases', () => {
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

  it('keurt een wijziging goed', async () => {
    await new KeurWijzigingGoed(repo, publisher, new VasteIdGenerator('W')).uitvoeren({
      contractId: 'C1', bedrag: 200, soort: 'Verhoging', reden: 'meerwerk', datum: '2026-03-01',
    });
    expect(publisher.types()).toContain('contract.wijziging.goedgekeurd');
    expect((await repo.zoek(ContractId.van('C1')))!.waarde.euro).toBe(1200);
  });

  it('stelt een prestatieverklaring op', async () => {
    await new StelPrestatieverklaringOp(repo, publisher, new VasteIdGenerator('P')).uitvoeren({
      contractId: 'C1', periodeStart: '2026-01-01', periodeEind: '2026-06-30', score: 85, bedrag: 500,
    });
    expect(publisher.types()).toContain('contract.prestatieverklaring.opgesteld');
  });

  it('rondt een contract af', async () => {
    await new RondOnderhoudscontractAf(repo, publisher).uitvoeren({ contractId: 'C1', datum: '2026-12-31' });
    expect(publisher.types()).toContain('contract.onderhoudscontract.afgerond');
    expect((await repo.zoek(ContractId.van('C1')))!.status).toBe('Afgerond');
  });
});
