import type { AanbestedingRepository, OnderhoudscontractRepository } from './ports.js';
import type { Aanbesteding } from '../domain/aanbesteding/aanbesteding.js';
import type { Onderhoudscontract } from '../domain/onderhoudscontract/onderhoudscontract.js';
import { AanbestedingId, ContractId, KunstwerkId } from '../domain/gedeeld/waarden.js';

export interface AanbestedingWeergave {
  aanbestedingId: string;
  kunstwerkId: string;
  status: string;
  aantalInschrijvingen: number;
}
export interface ContractWeergave {
  contractId: string;
  kunstwerkId: string;
  opdrachtnemer: string;
  status: string;
  waarde: number;
}

function naarAanbestedingWeergave(a: Aanbesteding): AanbestedingWeergave {
  return { aanbestedingId: a.id.waarde, kunstwerkId: a.kunstwerkId.waarde, status: a.status, aantalInschrijvingen: a.inschrijvingen.length };
}
function naarContractWeergave(c: Onderhoudscontract): ContractWeergave {
  return { contractId: c.id.waarde, kunstwerkId: c.kunstwerkId.waarde, opdrachtnemer: c.opdrachtnemerNaam, status: c.status, waarde: c.waarde.euro };
}

export async function zoekAanbestedingen(repo: AanbestedingRepository): Promise<AanbestedingWeergave[]> {
  return (await repo.zoekAlle()).map(naarAanbestedingWeergave);
}
export async function haalAanbesteding(repo: AanbestedingRepository, id: string): Promise<AanbestedingWeergave | null> {
  const a = await repo.zoek(AanbestedingId.van(id));
  return a ? naarAanbestedingWeergave(a) : null;
}
export async function zoekContracten(repo: OnderhoudscontractRepository): Promise<ContractWeergave[]> {
  return (await repo.zoekAlle()).map(naarContractWeergave);
}
export async function zoekContractenPerKunstwerk(repo: OnderhoudscontractRepository, kunstwerkId: string): Promise<ContractWeergave[]> {
  return (await repo.zoekPerKunstwerk(KunstwerkId.van(kunstwerkId))).map(naarContractWeergave);
}
export async function haalContract(repo: OnderhoudscontractRepository, id: string): Promise<ContractWeergave | null> {
  const c = await repo.zoek(ContractId.van(id));
  return c ? naarContractWeergave(c) : null;
}
