# Contract

Bounded context: **onderhoudscontracten & aanbestedingen**. Regelt de afspraken tussen
Rijkswaterstaat (opdrachtgever) en externe aannemers (opdrachtnemers) voor het onderhoud
van kunstwerken: opstellen, aanbesteden (volgens EMVI) en beheren van contracten. Binnen
deze context wordt een kunstwerk in de eigen taal vaak **"object"** genoemd; het verwijst
naar een kunstwerk uit Beheer via `kunstwerkId`.

- **Poort:** 8001
- **Database:** `contract_db`
- **Eigenaar:** _TBD_

## Verantwoordelijkheden
- Onderhoudscontract opstellen zodra een object in gebruik is (met de asset manager).
- Aanbesteden: publiceren, inschrijvingen ontvangen, beoordelen via **EMVI** (prijs + kwaliteit) en gunnen.
- Contract beheren: wijzigingen (meer-/minderwerk), prestatieverklaringen, eindafrekening.
- Vragen beantwoorden als "welk contract dekt object X?".

## Ubiquitous language (uit het verslag)
Onderhoudscontract · Aanbesteding · Inschrijving · Opdrachtgever (RWS) ·
Opdrachtnemer/OpdrachtnemerReferentie (KvK + naam) · ContractStatus (Concept/Aanbesteed/
Gegund/Lopend/Afgerond) · Looptijd · Geld · Prestatieverklaring · EMVI / EmviScore ·
Gunningscriteria · Inlichtingen · `kunstwerkId` (referentie naar Beheer, lokaal "object").

## Integratie
- **Publiceert:** `contract.aanbesteding.gepubliceerd`, `contract.inschrijving.ontvangen`,
  `contract.aanbesteding.gegund`, `contract.onderhoudscontract.gegund`,
  `contract.wijziging.goedgekeurd`, `contract.prestatieverklaring.opgesteld`,
  `contract.onderhoudscontract.afgerond`.
- **Consumeert:** `beheer.kunstwerk.*` en `beheer.ontwerpeisen.vastgesteld` (weten welke
  objecten bestaan en onder welke eisen), `monitoring.rapport.opgesteld` (conformist:
  KPI-/prestatiegegevens).
- **REST:** `GET /api/contracten`, `GET /api/contracten?kunstwerkId=...`.

## Draaien
Zie de [checklist in conventions.md](../docs/conventions.md#8-checklist--je-service-toevoegen).
