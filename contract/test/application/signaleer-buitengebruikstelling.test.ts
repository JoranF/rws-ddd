import { beforeEach, describe, expect, it } from 'vitest';
import { Onderhoudscontract } from '../../src/domain/onderhoudscontract/onderhoudscontract.js';
import { Aannemer, Bedrag, Contractperiode, ContractId, KunstwerkId } from '../../src/domain/gedeeld/waarden.js';
import { SignaleerBuitengebruikstelling } from '../../src/application/onderhoudscontract/signaleer-buitengebruikstelling.js';
import { InMemoryOnderhoudscontractRepository } from '../support/fakes.js';

function contract(id: string, kunstwerkId: string): Onderhoudscontract {
  return Onderhoudscontract.gun({
    id: ContractId.van(id),
    kunstwerkId: KunstwerkId.van(kunstwerkId),
    opdrachtnemer: Aannemer.van('BAM'),
    looptijd: Contractperiode.van(new Date('2026-01-01'), new Date('2026-12-31')),
    waarde: Bedrag.vanEuro(1000),
  });
}

describe('SignaleerBuitengebruikstelling', () => {
  let repo: InMemoryOnderhoudscontractRepository;

  beforeEach(async () => {
    repo = new InMemoryOnderhoudscontractRepository();
    const actief = contract('C1', 'KW1');
    const afgerond = contract('C2', 'KW1');
    afgerond.rondAf(new Date('2026-06-01'));
    const anderKunstwerk = contract('C3', 'KW2');
    await repo.bewaar(actief);
    await repo.bewaar(afgerond);
    await repo.bewaar(anderKunstwerk);
  });

  it('signaleert alleen de actieve contracten van het buitengebruikgestelde kunstwerk', async () => {
    const meldingen: string[] = [];
    const uc = new SignaleerBuitengebruikstelling(repo, (m) => meldingen.push(m));
    const { getroffenContracten } = await uc.uitvoeren({ kunstwerkId: 'KW1' });
    expect(getroffenContracten).toEqual(['C1']);
    expect(meldingen).toHaveLength(1);
    expect(meldingen[0]).toContain('C1');
  });

  it('meldt niets als er geen actieve contracten zijn', async () => {
    const meldingen: string[] = [];
    const uc = new SignaleerBuitengebruikstelling(repo, (m) => meldingen.push(m));
    const { getroffenContracten } = await uc.uitvoeren({ kunstwerkId: 'KW-onbekend' });
    expect(getroffenContracten).toEqual([]);
    expect(meldingen).toHaveLength(0);
  });
});
