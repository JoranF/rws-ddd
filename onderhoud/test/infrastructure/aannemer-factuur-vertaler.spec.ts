import { AclFout, vertaalExterneFactuur } from '../../src/infrastructure/acl/aannemer-factuur-vertaler';

const extern = {
  invoiceNumber: 'INV-2026-042',
  workOrderRef: 'O-1',
  totalExVatCents: 200000,
  vatCents: 42000,
  currency: 'EUR',
  issuedAt: '2026-07-06',
};

describe('vertaalExterneFactuur', () => {
  it('vertaalt het externe formaat naar het interne command (incl. btw, centen naar euro)', () => {
    const command = vertaalExterneFactuur(extern);
    expect(command).toEqual({ onderhoudId: 'O-1', bedragEuro: 2420, ontvangenOp: '2026-07-06' });
  });

  it('weigert een niet-EUR-valuta', () => {
    expect(() => vertaalExterneFactuur({ ...extern, currency: 'USD' })).toThrow(AclFout);
  });

  it('weigert een factuur zonder werkorder-referentie', () => {
    expect(() => vertaalExterneFactuur({ ...extern, workOrderRef: '' })).toThrow(AclFout);
  });
});
