import { Bedrag, ernstVan, KunstwerkId, Periode, StoringId } from '../../src/domain/gedeeld/waarden';
import { DomeinFout } from '../../src/domain/gedeeld/fouten';

describe('identiteiten', () => {
  it('weigert een lege waarde', () => {
    expect(() => StoringId.van('')).toThrow(DomeinFout);
  });
  it('is gelijk bij dezelfde waarde en hetzelfde type', () => {
    expect(StoringId.van('S-1').gelijkAan(StoringId.van('S-1'))).toBe(true);
    expect(KunstwerkId.van('KW-1').gelijkAan(KunstwerkId.van('KW-2'))).toBe(false);
  });
});

describe('ernstVan', () => {
  it('accepteert de vier niveaus uit het verslag', () => {
    expect(ernstVan('Kritiek')).toBe('Kritiek');
    expect(ernstVan('Laag')).toBe('Laag');
  });
  it('weigert een onbekend niveau', () => {
    expect(() => ernstVan('Enorm')).toThrow(DomeinFout);
  });
});

describe('Bedrag', () => {
  it('rekent euro naar centen', () => {
    expect(Bedrag.vanEuro(12.5).centen).toBe(1250);
  });
  it('weigert een negatief bedrag en niet-gehele centen', () => {
    expect(() => Bedrag.vanEuro(-1)).toThrow(DomeinFout);
    expect(() => Bedrag.vanCenten(1.5)).toThrow(DomeinFout);
  });
});

describe('Periode', () => {
  it('weigert een eind vóór het begin', () => {
    expect(() => Periode.van(new Date('2026-06-01'), new Date('2026-01-01'))).toThrow(DomeinFout);
  });
  it('bevat een datum binnen de periode', () => {
    const p = Periode.van(new Date('2026-01-01'), new Date('2026-12-31'));
    expect(p.bevat(new Date('2026-06-01'))).toBe(true);
    expect(p.bevat(new Date('2027-01-01'))).toBe(false);
  });
});
