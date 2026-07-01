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
- **REST:** `GET /api/onderhoud`, `POST /api/storingen`.

## Draaien
Zie de [checklist in conventions.md](../docs/conventions.md#8-checklist--je-service-toevoegen).
