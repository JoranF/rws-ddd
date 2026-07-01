# CLAUDE.md — Bounded Context: Onderhoud

Lees eerst `/CLAUDE.md` en `/docs/conventions.md`. Werk alleen binnen deze context.

## Grens
- **Bezit:** werkorders, inspecties, onderhoudsplanning en hun statusverloop.
- **Bezit NIET:** objecten (Beheer), contracten (Contract) of meldingen (Monitoring).
  Verwijs ernaar via `objectId` / `contractId` / `meldingId`.

## Regels voor AI-gedreven bouwen
- Respecteer de lagen; elke map heeft een eigen `CLAUDE.md`.
- Reageer op inkomende events (melding, contract, object) door use cases aan te roepen;
  vertaal ze in `infrastructure`, laat de envelope niet in `domain` lekken.
- Consumers idempotent maken (gebruik `eventId`).
- Poort **8003**, `GET /health` verplicht. DB: `onderhoud_db` via `DATABASE_URL`.

## Integratie
- **Publiceert:** `onderhoud.werkorder.aangemaakt`, `onderhoud.werkorder.afgerond`.
- **Consumeert:** `monitoring.melding.aangemaakt`, `contract.contract.afgesloten`,
  `beheer.object.*`.
