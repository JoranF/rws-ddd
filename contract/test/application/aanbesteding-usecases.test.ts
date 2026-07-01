import { beforeEach, describe, expect, it } from 'vitest';
import { PubliceerAanbesteding } from '../../src/application/aanbesteding/publiceer-aanbesteding.js';
import { OntvangInschrijving } from '../../src/application/aanbesteding/ontvang-inschrijving.js';
import { GunAanbesteding } from '../../src/application/aanbesteding/gun-aanbesteding.js';
import {
  FakeEventPublisher,
  FakeKunstwerkenReadModel,
  InMemoryAanbestedingRepository,
  InMemoryOnderhoudscontractRepository,
  VasteIdGenerator,
} from '../support/fakes.js';

describe('Aanbesteding-use-cases', () => {
  let aanbestedingen: InMemoryAanbestedingRepository;
  let contracten: InMemoryOnderhoudscontractRepository;
  let publisher: FakeEventPublisher;
  let ids: VasteIdGenerator;

  beforeEach(() => {
    aanbestedingen = new InMemoryAanbestedingRepository();
    contracten = new InMemoryOnderhoudscontractRepository();
    publisher = new FakeEventPublisher();
    ids = new VasteIdGenerator('A');
  });

  async function publiceer(): Promise<string> {
    const uc = new PubliceerAanbesteding(aanbestedingen, publisher, ids);
    const { aanbestedingId } = await uc.uitvoeren({
      kunstwerkId: 'KW1',
      sluitingsdatum: '2026-09-01',
      prijsgewicht: 60,
      kwaliteitsgewicht: 40,
    });
    return aanbestedingId;
  }

  it('publiceert een aanbesteding, bewaart en publiceert het event', async () => {
    const id = await publiceer();
    expect(await aanbestedingen.zoek((await aanbestedingen.zoekAlle())[0].id)).not.toBeNull();
    expect(publisher.types()).toContain('contract.aanbesteding.gepubliceerd');
    expect(id).toBe('A-1');
  });

  it('ontvangt een inschrijving', async () => {
    const id = await publiceer();
    const uc = new OntvangInschrijving(aanbestedingen, publisher, ids);
    await uc.uitvoeren({ aanbestedingId: id, aannemer: 'BAM', prijs: 1000, kwaliteitsscore: 80 });
    expect(publisher.types()).toContain('contract.inschrijving.ontvangen');
  });

  it('gunt en maakt een onderhoudscontract, publiceert beide events', async () => {
    const id = await publiceer();
    await new OntvangInschrijving(aanbestedingen, publisher, ids).uitvoeren({ aanbestedingId: id, aannemer: 'BAM', prijs: 1000, kwaliteitsscore: 80 });
    const readModel = new FakeKunstwerkenReadModel(true);
    const uc = new GunAanbesteding(aanbestedingen, contracten, publisher, readModel, new VasteIdGenerator('C'), 'soepel');
    const { contractId } = await uc.uitvoeren({ aanbestedingId: id, looptijdStart: '2026-01-01', looptijdEind: '2026-12-31' });
    expect(contractId).toBe('C-1');
    expect(publisher.types()).toEqual(expect.arrayContaining(['contract.aanbesteding.gegund', 'contract.onderhoudscontract.gegund']));
    expect(await contracten.zoekAlle()).toHaveLength(1);
  });

  it('blokkeert gunnen bij streng + onbekend kunstwerk', async () => {
    const id = await publiceer();
    await new OntvangInschrijving(aanbestedingen, publisher, ids).uitvoeren({ aanbestedingId: id, aannemer: 'BAM', prijs: 1000, kwaliteitsscore: 80 });
    const readModel = new FakeKunstwerkenReadModel(false);
    const uc = new GunAanbesteding(aanbestedingen, contracten, publisher, readModel, new VasteIdGenerator('C'), 'streng');
    await expect(uc.uitvoeren({ aanbestedingId: id, looptijdStart: '2026-01-01', looptijdEind: '2026-12-31' })).rejects.toThrow();
  });
});
