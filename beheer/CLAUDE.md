# CLAUDE.md — Bounded Context: Beheer

Lees eerst `/CLAUDE.md` en `/docs/conventions.md`. Werk alleen binnen deze context.

## Grens
- **Bezit:** het kunstwerk-register (Kunstwerk) en hun basisgegevens; de eisen
  (onderhouds-/ontwerpeisen); de uitgifte van `KunstwerkId`.
- **Bezit NIET:** contracten, incidenten, onderhoudstrajecten. Die horen bij andere
  contexts — benader ze nooit direct.

## Regels voor AI-gedreven bouwen
- Respecteer de lagen (`domain`/`application`/`infrastructure`/`interface`); elke map
  heeft een eigen `CLAUDE.md`.
- Beheer is de bron van waarheid voor `KunstwerkId`, maar niet puur upstream: het is
  **partner** van Onderhoud en **customer** van Monitoring (netwerkrapportage). Publiceer
  nette events als kunstwerken/eisen veranderen.
- Poort **8004**, `GET /health` verplicht. DB: `beheer_db` via `DATABASE_URL`.

## Integratie
- **Publiceert:** `beheer.kunstwerk.geregistreerd`, `beheer.kunstwerk.buitengebruikgesteld`,
  `beheer.onderhoudseisen.vastgesteld`, `beheer.ontwerpeisen.vastgesteld`
  (envelope: `/docs/events.md`).
- **Consumeert:** `monitoring.rapport.opgesteld`, `onderhoud.onderhoud.afgerond`.
