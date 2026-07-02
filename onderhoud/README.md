# Onderhoud

Bounded context: **storingen, diagnoses, onderhoudsschema's en facturen**. Zet een storing
of een datagedreven diagnose om in een onderhoudstraject, plant het bij een aannemer,
controleert de uitvoering via inspectie en handelt de factuur af.

- **Poort:** 8003
- **Database:** `onderhoud_db`
- **Eigenaar:** _TBD_

## Verantwoordelijkheden
- Twee instappunten afhandelen: een **Storing** (`MeldStoring`) of een **Diagnose**
  (`StelDiagnose`, op basis van monitoringdata).
- Een onderhoudstraject sturen: `StartOnderhoud` / `AfrondenOnderhoud`.
- Een **OnderhoudsSchema** maken (`MaakSchema`) met de gegunde aannemer.
- Uitvoering controleren via **Inspectie** en de **Factuur** afhandelen.
- Bij een nieuwe/aangepaste onderhoudsbehoefte een contractaanvraag naar Contract sturen.

## Ubiquitous language (uit het verslag)
Storing (StoringId) · Diagnose · Onderhoud (OnderhoudId) · OnderhoudsSchema (SchemaId) ·
Inspectie · Factuur (FactuurId) · AannemerId · Status ·
`kunstwerkId` / `contractId` (referenties naar andere contexts).

## Integratie
- **Publiceert:** `onderhoud.storing.gemeld`, `onderhoud.onderhoud.gestart`,
  `onderhoud.onderhoud.afgerond`, `onderhoud.contractaanvraag.ingediend`.
- **Consumeert:** `monitoring.incident.aangemaakt` (aanleiding),
  `contract.onderhoudscontract.gegund` (welke aannemer/voorwaarden),
  `beheer.onderhoudseisen.vastgesteld` en `beheer.kunstwerk.*`.
- **Relaties:** partner van **Beheer** (levert het onderhoudsrapport terug), customer van
  **Monitoring** en **Contract**. Externe aannemers via een **Anti-Corruption Layer**.

## REST-endpoints (Fase 1)

| Endpoint                                              | Doel                                            |
|-------------------------------------------------------|-------------------------------------------------|
| `POST /api/storingen`                                  | Storing melden (`MeldStoring`); plant bij ernst Hoog/Kritiek automatisch een traject |
| `GET /api/storingen`                                   | Storingen opvragen                              |
| `POST /api/diagnoses`                                  | Diagnose stellen op basis van monitoringdata (`StelDiagnose`) |
| `GET /api/onderhoud`, `GET /api/onderhoud/:id`         | Onderhoudstrajecten opvragen                    |
| `POST /api/onderhoud/:id/start`                        | Traject starten (`StartOnderhoud`)              |
| `POST /api/onderhoud/:id/inspecties`                   | Inspectie registreren                           |
| `POST /api/onderhoud/:id/afronden`                     | Traject afronden (`AfrondenOnderhoud`); vereist goedgekeurde inspectie |
| `POST /api/onderhoud/:id/facturen`                     | Factuur ontvangen (intern formaat)              |
| `POST /api/onderhoud/:id/facturen/:factuurId/goedkeuring` | Factuur goedkeuren; vereist afgerond traject |
| `POST /api/extern/facturen`                            | Externe aannemersfactuur via de **ACL**         |
| `POST /api/schemas`, `GET /api/schemas`                | OnderhoudsSchema maken/opvragen (`MaakSchema`)  |
| `POST /api/contractaanvragen`                          | Contractaanvraag indienen richting Contract     |
| `GET /health`                                          | Healthcheck (DB + broker)                       |

OpenAPI-documentatie: `GET /api/docs`.

## Implementatie
- **Geplande stack (Fase 1):** Node.js 22, TypeScript, **NestJS**, **TypeORM** (PostgreSQL
  `onderhoud_db`), amqplib, `@nestjs/swagger`, Jest — zoals afgesproken in
  [docs/vervolgstappen.md](../docs/vervolgstappen.md) (elke context een eigen stack).
- **Domein en application zijn framework-vrij** (pure TypeScript, geen NestJS/TypeORM);
  alleen infrastructure en interface kennen het framework.
- **Plan:** [docs/superpowers/plans/2026-07-01-onderhoud-service-fase-1.md](../docs/superpowers/plans/2026-07-01-onderhoud-service-fase-1.md)
  (18 taken, TDD, walking-skeleton-first).

## Draaien
Zie de [checklist in conventions.md](../docs/conventions.md#8-checklist--je-service-toevoegen).
