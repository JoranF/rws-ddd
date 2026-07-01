# CLAUDE.md — Bounded Context: Contract

Lees eerst `/CLAUDE.md` en `/docs/conventions.md`. Werk alleen binnen deze context.

## Grens
- **Bezit:** onderhoudscontracten, aannemers, contractvoorwaarden/SLA per object.
- **Bezit NIET:** de objecten zelf (dat is Beheer), meldingen (Monitoring) of werkorders
  (Onderhoud). Verwijs naar objecten via `objectId`; kopieer geen beheer-model.

## Regels voor AI-gedreven bouwen
- Respecteer de lagen; elke map heeft een eigen `CLAUDE.md`.
- Luister naar Beheer-events om te weten welke objecten bestaan; bewaar hooguit een
  read-model met de ID's die je nodig hebt.
- Poort **8001**, `GET /health` verplicht. DB: `contract_db` via `DATABASE_URL`.

## Integratie
- **Publiceert:** `contract.contract.afgesloten`, `contract.contract.beeindigd`.
- **Consumeert:** `beheer.object.*`.
