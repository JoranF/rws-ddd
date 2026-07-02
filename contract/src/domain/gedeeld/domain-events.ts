export interface DomainEvent {
  eventType: string;
  data: Record<string, unknown>;
}

export interface AanbestedingGepubliceerd extends DomainEvent {
  eventType: 'contract.aanbesteding.gepubliceerd';
  data: { aanbestedingId: string; kunstwerkId: string; sluitingsdatum: string; gunningscriteria: { prijsgewicht: number; kwaliteitsgewicht: number } };
}
export interface InschrijvingOntvangen extends DomainEvent {
  eventType: 'contract.inschrijving.ontvangen';
  data: { aanbestedingId: string; aannemer: string; prijs: number; kwaliteitsscore: number };
}
export interface AanbestedingGegund extends DomainEvent {
  eventType: 'contract.aanbesteding.gegund';
  data: { aanbestedingId: string; winnendeAannemer: string; emviScore: number };
}
export interface OnderhoudscontractGegund extends DomainEvent {
  eventType: 'contract.onderhoudscontract.gegund';
  data: { contractId: string; kunstwerkId: string; opdrachtnemer: string; looptijd: { start: string; eind: string } };
}
export interface WijzigingGoedgekeurd extends DomainEvent {
  eventType: 'contract.wijziging.goedgekeurd';
  data: { contractId: string; bedrag: number; reden: string; datum: string };
}
export interface PrestatieverklaringOpgesteld extends DomainEvent {
  eventType: 'contract.prestatieverklaring.opgesteld';
  data: { contractId: string; periode: { start: string; eind: string }; score: number; bedrag: number };
}
export interface OnderhoudscontractAfgerond extends DomainEvent {
  eventType: 'contract.onderhoudscontract.afgerond';
  data: { contractId: string; kunstwerkId: string; datum: string };
}

export type ContractDomainEvent =
  | AanbestedingGepubliceerd
  | InschrijvingOntvangen
  | AanbestedingGegund
  | OnderhoudscontractGegund
  | WijzigingGoedgekeurd
  | PrestatieverklaringOpgesteld
  | OnderhoudscontractAfgerond;
