# Monitoring

Bounded context: **conditie-/sensordata en meldingen**. Verzamelt metingen over objecten,
bewaakt drempelwaarden en maakt meldingen aan bij afwijkingen.

- **Poort:** 8002
- **Database:** `monitoring_db`
- **Eigenaar:** _TBD_

## Verantwoordelijkheden
- Metingen/inspectiewaarden per object registreren.
- Drempelwaarden bewaken en de conditie van een object bepalen.
- Meldingen (alerts) aanmaken met een ernst wanneer iets afwijkt.

## Ubiquitous language (startpunt)
Meting · Sensor · Conditie · Drempelwaarde · Melding (Alert) · Ernst ·
ObjectId (referentie naar Beheer).

## Integratie
- **Publiceert:** `monitoring.meting.geregistreerd`, `monitoring.melding.aangemaakt`.
- **Consumeert:** `beheer.object.geregistreerd`, `beheer.object.buitengebruikgesteld`
  (weten welke objecten gemonitord moeten worden).
- **REST:** `GET /api/metingen?objectId=...`, `GET /api/meldingen`.

## Draaien
Zie de [checklist in conventions.md](../docs/conventions.md#8-checklist--je-service-toevoegen).
