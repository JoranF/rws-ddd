import { describe, expect, it } from 'vitest';
import { Aanbesteding } from '../../src/domain/aanbesteding/aanbesteding.js';
import { Aannemer, AanbestedingId, Bedrag, Gunningscriteria, KunstwerkId } from '../../src/domain/gedeeld/waarden.js';
import { DomeinFout } from '../../src/domain/gedeeld/fouten.js';

function nieuweAanbesteding(): Aanbesteding {
  return Aanbesteding.publiceer({
    id: AanbestedingId.van('A1'),
    kunstwerkId: KunstwerkId.van('KW1'),
    sluitingsdatum: new Date('2026-09-01'),
    criteria: Gunningscriteria.van(60, 40),
  });
}

describe('Aanbesteding', () => {
  it('registreert een gepubliceerd-event bij publiceren', () => {
    const a = nieuweAanbesteding();
    const events = a.trekEventsLeeg();
    expect(events.map((e) => e.eventType)).toContain('contract.aanbesteding.gepubliceerd');
    expect(a.status).toBe('Gepubliceerd');
  });

  it('ontvangt inschrijvingen en registreert een event', () => {
    const a = nieuweAanbesteding();
    a.trekEventsLeeg();
    a.ontvangInschrijving({ id: 'I1', aannemer: Aannemer.van('BAM'), prijs: Bedrag.vanEuro(1000), kwaliteitsscore: 80 });
    expect(a.inschrijvingen).toHaveLength(1);
    expect(a.trekEventsLeeg()[0].eventType).toBe('contract.inschrijving.ontvangen');
  });

  it('weigert gunnen zonder inschrijvingen', () => {
    const a = nieuweAanbesteding();
    expect(() => a.gun()).toThrow(DomeinFout);
  });

  it('kiest bij gunnen de hoogste EMVI-score (laagste prijs + hoogste kwaliteit)', () => {
    const a = nieuweAanbesteding();
    a.ontvangInschrijving({ id: 'I1', aannemer: Aannemer.van('Duur maar goed'), prijs: Bedrag.vanEuro(2000), kwaliteitsscore: 100 });
    a.ontvangInschrijving({ id: 'I2', aannemer: Aannemer.van('Goedkoop'), prijs: Bedrag.vanEuro(1000), kwaliteitsscore: 60 });
    // I1: prijsscore=1000/2000=0.5 -> 50*0.6=30 ; kwaliteit 100*0.4=40 -> 70
    // I2: prijsscore=1000/1000=1.0 -> 100*0.6=60 ; kwaliteit 60*0.4=24 -> 84
    const uitslag = a.gun();
    expect(uitslag.winnaar.naam).toBe('Goedkoop');
    expect(uitslag.emviScore).toBeCloseTo(84);
    expect(a.status).toBe('Gegund');
  });

  it('weigert dubbel gunnen', () => {
    const a = nieuweAanbesteding();
    a.ontvangInschrijving({ id: 'I1', aannemer: Aannemer.van('BAM'), prijs: Bedrag.vanEuro(1000), kwaliteitsscore: 80 });
    a.gun();
    expect(() => a.gun()).toThrow(DomeinFout);
  });

  it('weigert inschrijven na gunnen', () => {
    const a = nieuweAanbesteding();
    a.ontvangInschrijving({ id: 'I1', aannemer: Aannemer.van('BAM'), prijs: Bedrag.vanEuro(1000), kwaliteitsscore: 80 });
    a.gun();
    expect(() => a.ontvangInschrijving({ id: 'I2', aannemer: Aannemer.van('X'), prijs: Bedrag.vanEuro(900), kwaliteitsscore: 70 })).toThrow(DomeinFout);
  });
});
