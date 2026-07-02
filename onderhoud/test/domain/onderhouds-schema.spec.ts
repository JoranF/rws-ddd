import { OnderhoudsSchema } from '../../src/domain/schema/onderhouds-schema';
import { ContractId, KunstwerkId, Periode, SchemaId } from '../../src/domain/gedeeld/waarden';
import { DomeinFout } from '../../src/domain/gedeeld/fouten';

const periode = Periode.van(new Date('2026-01-01'), new Date('2026-12-31'));

function nieuwSchema(): OnderhoudsSchema {
  return OnderhoudsSchema.maak({
    id: SchemaId.van('SCH1'),
    kunstwerkId: KunstwerkId.van('KW1'),
    contractId: ContractId.van('C1'),
    aannemer: 'BAM',
    periode,
    momenten: [{ datum: new Date('2026-03-01'), omschrijving: 'smeren bewegingswerk' }],
  });
}

describe('OnderhoudsSchema', () => {
  it('maakt een schema met minstens één moment binnen de periode', () => {
    const s = nieuwSchema();
    expect(s.momenten).toHaveLength(1);
    expect(s.aannemer).toBe('BAM');
  });

  it('weigert een schema zonder momenten', () => {
    expect(() => OnderhoudsSchema.maak({
      id: SchemaId.van('SCH1'),
      kunstwerkId: KunstwerkId.van('KW1'),
      contractId: ContractId.van('C1'),
      aannemer: 'BAM',
      periode,
      momenten: [],
    })).toThrow(DomeinFout);
  });

  it('weigert een moment buiten de periode', () => {
    const s = nieuwSchema();
    expect(() => s.voegMomentToe({ datum: new Date('2027-03-01'), omschrijving: 'te laat' })).toThrow(DomeinFout);
    s.voegMomentToe({ datum: new Date('2026-09-01'), omschrijving: 'najaarsinspectie' });
    expect(s.momenten).toHaveLength(2);
  });
});
