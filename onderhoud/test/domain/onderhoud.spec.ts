import { Onderhoud } from '../../src/domain/onderhoud/onderhoud';
import { Bedrag, ContractId, FactuurId, InspectieId, KunstwerkId, OnderhoudId, StoringId } from '../../src/domain/gedeeld/waarden';
import { DomeinFout } from '../../src/domain/gedeeld/fouten';

function nieuwTraject(): Onderhoud {
  return Onderhoud.plan({
    id: OnderhoudId.van('O1'),
    kunstwerkId: KunstwerkId.van('KW1'),
    aanleiding: { soort: 'Storing', storingId: StoringId.van('S1') },
  });
}

function gestartTraject(): Onderhoud {
  const o = nieuwTraject();
  o.start({ datum: new Date('2026-07-01'), contractId: ContractId.van('C1') });
  o.trekEventsLeeg();
  return o;
}

describe('Onderhoud', () => {
  it('plant zonder event en start met een gestart-event', () => {
    const o = nieuwTraject();
    expect(o.status).toBe('Gepland');
    expect(o.trekEventsLeeg()).toHaveLength(0);
    o.start({ datum: new Date('2026-07-01') });
    expect(o.status).toBe('Gestart');
    const events = o.trekEventsLeeg();
    expect(events[0].eventType).toBe('onderhoud.onderhoud.gestart');
    expect(events[0].data).toEqual({ onderhoudId: 'O1', kunstwerkId: 'KW1', datum: '2026-07-01T00:00:00.000Z' });
  });

  it('weigert dubbel starten', () => {
    const o = gestartTraject();
    expect(() => o.start({ datum: new Date('2026-07-02') })).toThrow(DomeinFout);
  });

  it('weigert een inspectie op een niet-gestart traject', () => {
    const o = nieuwTraject();
    expect(() => o.registreerInspectie({ id: InspectieId.van('I1'), datum: new Date('2026-07-02'), oordeel: 'Goedgekeurd' })).toThrow(DomeinFout);
  });

  it('weigert afronden zonder goedgekeurde inspectie', () => {
    const o = gestartTraject();
    expect(() => o.rondAf({ resultaat: 'hersteld', datum: new Date('2026-07-10') })).toThrow(DomeinFout);
    o.registreerInspectie({ id: InspectieId.van('I1'), datum: new Date('2026-07-05'), oordeel: 'Afgekeurd', opmerkingen: 'lasnaad onvoldoende' });
    expect(() => o.rondAf({ resultaat: 'hersteld', datum: new Date('2026-07-10') })).toThrow(DomeinFout);
  });

  it('rondt af na een goedgekeurde inspectie en registreert het afgerond-event', () => {
    const o = gestartTraject();
    o.registreerInspectie({ id: InspectieId.van('I1'), datum: new Date('2026-07-05'), oordeel: 'Goedgekeurd' });
    o.rondAf({ resultaat: 'hersteld', datum: new Date('2026-07-10') });
    expect(o.status).toBe('Afgerond');
    const events = o.trekEventsLeeg();
    expect(events[0].eventType).toBe('onderhoud.onderhoud.afgerond');
    expect(events[0].data).toEqual({ onderhoudId: 'O1', kunstwerkId: 'KW1', resultaat: 'hersteld', datum: '2026-07-10T00:00:00.000Z' });
    expect(() => o.rondAf({ resultaat: 'x', datum: new Date('2026-07-11') })).toThrow(DomeinFout);
  });

  it('ontvangt een factuur maar keurt pas goed na afronding', () => {
    const o = gestartTraject();
    o.ontvangFactuur({ id: FactuurId.van('F1'), bedrag: Bedrag.vanEuro(2500), ontvangenOp: new Date('2026-07-06') });
    expect(o.facturen[0].status).toBe('Ontvangen');
    expect(() => o.keurFactuurGoed(FactuurId.van('F1'))).toThrow(DomeinFout);
    o.registreerInspectie({ id: InspectieId.van('I1'), datum: new Date('2026-07-05'), oordeel: 'Goedgekeurd' });
    o.rondAf({ resultaat: 'hersteld', datum: new Date('2026-07-10') });
    o.keurFactuurGoed(FactuurId.van('F1'));
    expect(o.facturen[0].status).toBe('Goedgekeurd');
  });

  it('weigert een onbekende factuur goed te keuren', () => {
    const o = gestartTraject();
    expect(() => o.keurFactuurGoed(FactuurId.van('F9'))).toThrow(DomeinFout);
  });
});
