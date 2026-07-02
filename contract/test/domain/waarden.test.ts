import { describe, expect, it } from 'vitest';
import {
  Aannemer,
  Bedrag,
  Contractperiode,
  Gunningscriteria,
  KunstwerkId,
} from '../../src/domain/gedeeld/waarden.js';
import { DomeinFout } from '../../src/domain/gedeeld/fouten.js';

describe('KunstwerkId', () => {
  it('weigert een lege waarde', () => {
    expect(() => KunstwerkId.van('')).toThrow(DomeinFout);
  });
  it('is gelijk bij dezelfde waarde', () => {
    expect(KunstwerkId.van('KW-1').gelijkAan(KunstwerkId.van('KW-1'))).toBe(true);
  });
});

describe('Bedrag', () => {
  it('rekent euro naar centen', () => {
    expect(Bedrag.vanEuro(12.5).centen).toBe(1250);
  });
  it('weigert een negatief bedrag', () => {
    expect(() => Bedrag.vanEuro(-1)).toThrow(DomeinFout);
  });
  it('telt op en trekt af', () => {
    expect(Bedrag.vanEuro(10).plus(Bedrag.vanEuro(5)).euro).toBe(15);
    expect(Bedrag.vanEuro(10).min(Bedrag.vanEuro(4)).euro).toBe(6);
  });
  it('weigert aftrekken onder nul', () => {
    expect(() => Bedrag.vanEuro(3).min(Bedrag.vanEuro(4))).toThrow(DomeinFout);
  });
});

describe('Contractperiode', () => {
  it('weigert een eind vóór het begin', () => {
    expect(() => Contractperiode.van(new Date('2026-06-01'), new Date('2026-01-01'))).toThrow(DomeinFout);
  });
  it('bevat een datum binnen de periode en omvat een subperiode', () => {
    const p = Contractperiode.van(new Date('2026-01-01'), new Date('2026-12-31'));
    expect(p.bevat(new Date('2026-06-01'))).toBe(true);
    expect(p.omvat(Contractperiode.van(new Date('2026-02-01'), new Date('2026-03-01')))).toBe(true);
    expect(p.omvat(Contractperiode.van(new Date('2025-12-01'), new Date('2026-03-01')))).toBe(false);
  });
});

describe('Gunningscriteria', () => {
  it('eist dat de gewichten samen 100 zijn', () => {
    expect(() => Gunningscriteria.van(60, 30)).toThrow(DomeinFout);
    expect(Gunningscriteria.van(60, 40).prijsgewicht).toBe(60);
  });
});

describe('Aannemer', () => {
  it('weigert een lege naam', () => {
    expect(() => Aannemer.van('')).toThrow(DomeinFout);
  });
});
