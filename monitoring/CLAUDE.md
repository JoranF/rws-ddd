# CLAUDE.md — Bounded Context: Monitoring

Lees eerst `/CLAUDE.md` en `/docs/conventions.md`. Werk alleen binnen deze context.

## Grens
- **Bezit:** metingen, sensoren, drempelwaarden en meldingen (alerts).
- **Bezit NIET:** de objecten zelf (Beheer) of het werk dat op een melding volgt
  (Onderhoud). Verwijs naar objecten via `objectId`.

## Regels voor AI-gedreven bouwen
- Respecteer de lagen; elke map heeft een eigen `CLAUDE.md`.
- Een melding is een *feit* dat je publiceert; beslis niet zelf over werkorders — dat
  doet Onderhoud op basis van jouw event.
- Poort **8002**, `GET /health` verplicht. DB: `monitoring_db` via `DATABASE_URL`.

## Integratie
- **Publiceert:** `monitoring.meting.geregistreerd`, `monitoring.melding.aangemaakt`.
- **Consumeert:** `beheer.object.*`.
