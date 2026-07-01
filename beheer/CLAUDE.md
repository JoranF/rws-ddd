# CLAUDE.md — Bounded Context: Beheer

Lees eerst `/CLAUDE.md` en `/docs/conventions.md`. Werk alleen binnen deze context.

## Grens
- **Bezit:** het register van objecten (Object/Kunstwerk) en hun basisgegevens; de
  uitgifte van `ObjectId`.
- **Bezit NIET:** contracten, meldingen, werkorders. Die horen bij andere contexts —
  benader ze nooit direct.

## Regels voor AI-gedreven bouwen
- Respecteer de lagen (`domain`/`application`/`infrastructure`/`interface`); elke map
  heeft een eigen `CLAUDE.md`.
- Beheer is upstream: publiceer nette events als objecten veranderen, maar bouw geen
  afhankelijkheid op andere contexts.
- Poort **8004**, `GET /health` verplicht. DB: `beheer_db` via `DATABASE_URL`.

## Integratie
- **Publiceert:** `beheer.object.geregistreerd`, `beheer.object.gewijzigd`,
  `beheer.object.buitengebruikgesteld` (envelope: `/docs/events.md`).
- **Consumeert:** niets.
