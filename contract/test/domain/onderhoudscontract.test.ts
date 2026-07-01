import { describe, expect, it } from 'vitest';
import { Onderhoudscontract } from '../../src/domain/onderhoudscontract/onderhoudscontract.js';
import { Aannemer, Bedrag, Contractperiode, ContractId, KunstwerkId } from '../../src/domain/gedeeld/waarden.js';
import { DomeinFout } from '../../src/domain/gedeeld/fouten.js';

function nieuwContract(): Onderhoudscontract {
  return Onderhoudscontract.gun({
    id: ContractId.van('C1'),
    kunstwerkId: KunstwerkId.van('KW1'),
    opdrachtnemer: Aannemer.van('BAM'),
    looptijd: Contractperiode.van(new Date('2026-01-01'), new Date('2026-12-31')),
    waarde: Bedrag.vanEuro(1000),
  });
}

describe('Onderhoudscontract', () => {
  it('registreert gegund-event en staat op Actief', () => {
    const c = nieuwContract();
    expect(c.status).toBe('Actief');
    expect(c.trekEventsLeeg()[0].eventType).toBe('contract.onderhoudscontract.gegund');
  });

  it('verhoogt en verlaagt de waarde bij een goedgekeurde wijziging', () => {
    const c = nieuwContract();
    c.trekEventsLeeg();
    c.keurWijzigingGoed({ id: 'W1', mutatie: Bedrag.vanEuro(200), soort: 'Verhoging', reden: 'meerwerk', datum: new Date('2026-03-01') });
    expect(c.waarde.euro).toBe(1200);
    expect(c.trekEventsLeeg()[0].eventType).toBe('contract.wijziging.goedgekeurd');
    c.keurWijzigingGoed({ id: 'W2', mutatie: Bedrag.vanEuro(300), soort: 'Verlaging', reden: 'minderwerk', datum: new Date('2026-04-01') });
    expect(c.waarde.euro).toBe(900);
  });

  it('weigert een verlaging onder nul', () => {
    const c = nieuwContract();
    expect(() => c.keurWijzigingGoed({ id: 'W1', mutatie: Bedrag.vanEuro(5000), soort: 'Verlaging', reden: 'x', datum: new Date('2026-03-01') })).toThrow(DomeinFout);
  });

  it('stelt een prestatieverklaring op binnen de looptijd', () => {
    const c = nieuwContract();
    c.trekEventsLeeg();
    c.stelPrestatieverklaringOp({ id: 'P1', periode: Contractperiode.van(new Date('2026-01-01'), new Date('2026-06-30')), score: 85, bedrag: Bedrag.vanEuro(500) });
    expect(c.trekEventsLeeg()[0].eventType).toBe('contract.prestatieverklaring.opgesteld');
  });

  it('weigert een prestatieverklaring buiten de looptijd', () => {
    const c = nieuwContract();
    expect(() => c.stelPrestatieverklaringOp({ id: 'P1', periode: Contractperiode.van(new Date('2025-01-01'), new Date('2025-06-30')), score: 85, bedrag: Bedrag.vanEuro(500) })).toThrow(DomeinFout);
  });

  it('rondt af en blokkeert daarna mutaties', () => {
    const c = nieuwContract();
    c.trekEventsLeeg();
    c.rondAf(new Date('2026-12-31'));
    expect(c.status).toBe('Afgerond');
    expect(c.trekEventsLeeg()[0].eventType).toBe('contract.onderhoudscontract.afgerond');
    expect(() => c.keurWijzigingGoed({ id: 'W1', mutatie: Bedrag.vanEuro(1), soort: 'Verhoging', reden: 'x', datum: new Date('2026-12-31') })).toThrow(DomeinFout);
    expect(() => c.rondAf(new Date('2026-12-31'))).toThrow(DomeinFout);
  });
});
