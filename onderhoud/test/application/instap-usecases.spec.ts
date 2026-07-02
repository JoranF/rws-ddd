import { MeldStoring } from '../../src/application/storing/meld-storing';
import { StelDiagnose } from '../../src/application/diagnose/stel-diagnose';
import {
  FakeEventPublisher,
  FakeKunstwerkenReadModel,
  InMemoryOnderhoudRepository,
  InMemoryStoringRepository,
  VasteIdGenerator,
} from '../support/fakes';

describe('MeldStoring', () => {
  let storingen: InMemoryStoringRepository;
  let onderhouden: InMemoryOnderhoudRepository;
  let publisher: FakeEventPublisher;

  beforeEach(() => {
    storingen = new InMemoryStoringRepository();
    onderhouden = new InMemoryOnderhoudRepository();
    publisher = new FakeEventPublisher();
  });

  function useCase(validatie: 'soepel' | 'streng' = 'soepel', kunstwerkBekend = true): MeldStoring {
    return new MeldStoring(storingen, onderhouden, publisher, new FakeKunstwerkenReadModel(kunstwerkBekend), new VasteIdGenerator('X'), validatie);
  }

  it('bewaart de storing en publiceert het gemeld-event', async () => {
    const { storingId } = await useCase().uitvoeren({ kunstwerkId: 'KW1', omschrijving: 'slagboom klemt', ernst: 'Laag' });
    expect(storingId).toBe('X-1');
    expect(await storingen.zoekAlle()).toHaveLength(1);
    expect(publisher.types()).toContain('onderhoud.storing.gemeld');
  });

  it('plant bij ernst Hoog automatisch een traject en koppelt de storing', async () => {
    const { storingId, onderhoudId } = await useCase().uitvoeren({ kunstwerkId: 'KW1', omschrijving: 'scheur in pijler', ernst: 'Hoog' });
    expect(onderhoudId).toBe('X-2');
    const trajecten = await onderhouden.zoekAlle();
    expect(trajecten).toHaveLength(1);
    expect(trajecten[0].status).toBe('Gepland');
    const storing = (await storingen.zoekAlle())[0];
    expect(storing.status).toBe('InBehandeling');
    expect(storing.onderhoudId?.waarde).toBe(onderhoudId);
    expect(storing.id.waarde).toBe(storingId);
  });

  it('plant bij ernst Laag geen traject', async () => {
    const { onderhoudId } = await useCase().uitvoeren({ kunstwerkId: 'KW1', omschrijving: 'lamp kapot', ernst: 'Laag' });
    expect(onderhoudId).toBeUndefined();
    expect(await onderhouden.zoekAlle()).toHaveLength(0);
  });

  it('weigert bij streng + onbekend kunstwerk', async () => {
    await expect(useCase('streng', false).uitvoeren({ kunstwerkId: 'KW9', omschrijving: 'x', ernst: 'Laag' })).rejects.toThrow();
  });

  it('weigert een onbekende ernst', async () => {
    await expect(useCase().uitvoeren({ kunstwerkId: 'KW1', omschrijving: 'x', ernst: 'Enorm' })).rejects.toThrow();
  });
});

describe('StelDiagnose', () => {
  it('plant bij Kritiek een traject met aanleiding Diagnose', async () => {
    const onderhouden = new InMemoryOnderhoudRepository();
    const uc = new StelDiagnose(onderhouden, new VasteIdGenerator('O'));
    const { onderhoudId } = await uc.uitvoeren({ kunstwerkId: 'KW1', incidentId: 'INC1', bevinding: 'trilling boven drempel', ernst: 'Kritiek' });
    expect(onderhoudId).toBe('O-1');
    const traject = (await onderhouden.zoekAlle())[0];
    expect(traject.aanleiding.soort).toBe('Diagnose');
  });

  it('plant bij Middel geen traject', async () => {
    const onderhouden = new InMemoryOnderhoudRepository();
    const uc = new StelDiagnose(onderhouden, new VasteIdGenerator('O'));
    const { onderhoudId } = await uc.uitvoeren({ kunstwerkId: 'KW1', bevinding: 'lichte afwijking', ernst: 'Middel' });
    expect(onderhoudId).toBeNull();
    expect(await onderhouden.zoekAlle()).toHaveLength(0);
  });
});
