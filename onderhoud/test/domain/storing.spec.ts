import { Storing } from '../../src/domain/storing/storing';
import { vereistOnderhoud } from '../../src/domain/diagnose/diagnose';
import { KunstwerkId, OnderhoudId, StoringId } from '../../src/domain/gedeeld/waarden';
import { DomeinFout } from '../../src/domain/gedeeld/fouten';

function nieuweStoring(): Storing {
  return Storing.meld({
    id: StoringId.van('S1'),
    kunstwerkId: KunstwerkId.van('KW1'),
    omschrijving: 'brugdek trilt',
    ernst: 'Hoog',
  });
}

describe('Storing', () => {
  it('registreert een gemeld-event bij melden', () => {
    const s = nieuweStoring();
    const events = s.trekEventsLeeg();
    expect(events.map((e) => e.eventType)).toContain('onderhoud.storing.gemeld');
    expect(events[0].data).toEqual({ storingId: 'S1', kunstwerkId: 'KW1', omschrijving: 'brugdek trilt' });
    expect(s.status).toBe('Gemeld');
  });

  it('gaat naar InBehandeling bij koppelen aan een onderhoudstraject', () => {
    const s = nieuweStoring();
    s.koppelAanOnderhoud(OnderhoudId.van('O1'));
    expect(s.status).toBe('InBehandeling');
    expect(s.onderhoudId?.waarde).toBe('O1');
  });

  it('kan afgehandeld worden en weigert daarna mutaties', () => {
    const s = nieuweStoring();
    s.handelAf();
    expect(s.status).toBe('Afgehandeld');
    expect(() => s.handelAf()).toThrow(DomeinFout);
    expect(() => s.koppelAanOnderhoud(OnderhoudId.van('O1'))).toThrow(DomeinFout);
  });
});

describe('vereistOnderhoud', () => {
  it('vereist onderhoud bij Hoog en Kritiek, niet bij Laag en Middel', () => {
    expect(vereistOnderhoud('Kritiek')).toBe(true);
    expect(vereistOnderhoud('Hoog')).toBe(true);
    expect(vereistOnderhoud('Middel')).toBe(false);
    expect(vereistOnderhoud('Laag')).toBe(false);
  });
});
