export interface DomainEvent {
  eventType: string;
  data: Record<string, unknown>;
}

export interface StoringGemeld extends DomainEvent {
  eventType: 'onderhoud.storing.gemeld';
  data: { storingId: string; kunstwerkId: string; omschrijving: string };
}
export interface OnderhoudGestart extends DomainEvent {
  eventType: 'onderhoud.onderhoud.gestart';
  data: { onderhoudId: string; kunstwerkId: string; datum: string };
}
export interface OnderhoudAfgerond extends DomainEvent {
  eventType: 'onderhoud.onderhoud.afgerond';
  data: { onderhoudId: string; kunstwerkId: string; resultaat: string; datum: string };
}
export interface ContractaanvraagIngediend extends DomainEvent {
  eventType: 'onderhoud.contractaanvraag.ingediend';
  data: { kunstwerkId: string; aanleiding: string };
}

export type OnderhoudDomainEvent =
  | StoringGemeld
  | OnderhoudGestart
  | OnderhoudAfgerond
  | ContractaanvraagIngediend;
