import type { OntvangFactuurCommand } from '../../application/onderhoud/ontvang-factuur';

export class AclFout extends Error {
  constructor(bericht: string) {
    super(bericht);
    this.name = 'AclFout';
  }
}

export interface ExterneFactuur {
  invoiceNumber: string;
  workOrderRef: string;
  totalExVatCents: number;
  vatCents: number;
  currency: string;
  issuedAt: string;
}

export function vertaalExterneFactuur(extern: ExterneFactuur): OntvangFactuurCommand {
  if (extern.currency !== 'EUR') throw new AclFout(`alleen EUR wordt ondersteund, kreeg ${extern.currency}`);
  if (!extern.workOrderRef || extern.workOrderRef.trim() === '') throw new AclFout('workOrderRef ontbreekt — geen koppeling naar een onderhoudstraject');
  return {
    onderhoudId: extern.workOrderRef,
    bedragEuro: (extern.totalExVatCents + extern.vatCents) / 100,
    ontvangenOp: extern.issuedAt,
  };
}
