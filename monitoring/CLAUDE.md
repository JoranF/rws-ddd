# CLAUDE.md — Bounded Context: Monitoring

Lees eerst `/CLAUDE.md` en `/docs/conventions.md`. Werk alleen binnen deze context.

## Grens
- **Bezit:** sensoren, sensordata, monitoringsessies, afwijkingen en incidenten; de
  monitoringrapportage.
- **Bezit NIET:** de kunstwerken zelf (Beheer) of het onderhoud dat op een incident volgt
  (Onderhoud). Verwijs naar het kunstwerk via `kunstwerkId` (KunstwerkReferentie).

## Regels voor AI-gedreven bouwen
- Respecteer de lagen; elke map heeft een eigen `CLAUDE.md`.
- Een incident is een *feit* dat je publiceert; beslis niet zelf over het onderhoud — dat
  doet Onderhoud op basis van jouw event.
- Externe sensoren/systemen vertaal je via een **Anti-Corruption Layer** in `infrastructure`.
- Poort **8002**, `GET /health` verplicht. DB: `monitoring_db` via `DATABASE_URL`.

## Integratie
- **Publiceert:** `monitoring.meting.geregistreerd`, `monitoring.incident.aangemaakt`,
  `monitoring.incident.opgelost`, `monitoring.rapport.opgesteld`,
  `monitoring.netwerkrapportage.opgesteld`.
- **Consumeert:** `beheer.kunstwerk.*`.
