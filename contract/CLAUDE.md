# CLAUDE.md — Bounded Context: Contract

Lees eerst `/CLAUDE.md` en `/docs/conventions.md`. Werk alleen binnen deze context.

## Grens
- **Bezit:** onderhoudscontracten en aanbestedingen (EMVI), opdrachtnemers, contract-
  voorwaarden per kunstwerk. Binnen deze context heet het kunstwerk in de eigen taal "object".
- **Bezit NIET:** de kunstwerken zelf (dat is Beheer), incidenten (Monitoring) of
  onderhoudstrajecten (Onderhoud). Verwijs naar het kunstwerk via `kunstwerkId`; kopieer
  geen beheer-model.

## Regels voor AI-gedreven bouwen
- Respecteer de lagen; elke map heeft een eigen `CLAUDE.md`.
- Luister naar Beheer-events om te weten welke kunstwerken bestaan; bewaar hooguit een
  read-model met de ID's die je nodig hebt. Richting Monitoring conformeer je je aan hun
  datamodel (KPI's/prestatieverklaringen).
- Poort **8001**, `GET /health` verplicht. DB: `contract_db` via `DATABASE_URL`.

## Integratie
- **Publiceert:** `contract.aanbesteding.gepubliceerd`, `contract.aanbesteding.gegund`,
  `contract.onderhoudscontract.gegund`, `contract.prestatieverklaring.opgesteld`,
  `contract.onderhoudscontract.afgerond` (zie `/docs/events.md` voor de volledige lijst).
- **Consumeert:** `beheer.kunstwerk.*`, `beheer.ontwerpeisen.vastgesteld`,
  `monitoring.rapport.opgesteld`.
