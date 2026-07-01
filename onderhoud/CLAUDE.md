# CLAUDE.md — Bounded Context: Onderhoud

Lees eerst `/CLAUDE.md` en `/docs/conventions.md`. Werk alleen binnen deze context.

## Grens
- **Bezit:** storingen, diagnoses, onderhoudstrajecten, onderhoudsschema's, inspecties en
  facturen, en hun statusverloop.
- **Bezit NIET:** kunstwerken (Beheer), contracten (Contract) of incidenten (Monitoring).
  Verwijs ernaar via `kunstwerkId` / `contractId` / `incidentId`.

## Regels voor AI-gedreven bouwen
- Respecteer de lagen; elke map heeft een eigen `CLAUDE.md`.
- Reageer op inkomende events (incident, contract, kunstwerk) door use cases aan te roepen;
  vertaal ze in `infrastructure`, laat de envelope niet in `domain` lekken.
- Externe aannemers (factuur-/inspectieformats) vertaal je via een **Anti-Corruption Layer**.
- Consumers idempotent maken (gebruik `eventId`).
- Poort **8003**, `GET /health` verplicht. DB: `onderhoud_db` via `DATABASE_URL`.

## Integratie
- **Publiceert:** `onderhoud.storing.gemeld`, `onderhoud.onderhoud.gestart`,
  `onderhoud.onderhoud.afgerond`, `onderhoud.contractaanvraag.ingediend`.
- **Consumeert:** `monitoring.incident.aangemaakt`, `contract.onderhoudscontract.gegund`,
  `beheer.onderhoudseisen.vastgesteld`, `beheer.kunstwerk.*`.
