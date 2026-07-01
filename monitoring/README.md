# Monitoring

Bounded context: **sensordata, afwijkingen en incidenten**. Verzamelt continu metingen
van sensoren op kunstwerken, analyseert die op afwijkingen en maakt bij een bevestigde
afwijking een incident aan. Monitoring past het kunstwerk zelf niet aan, maar levert data,
analyses en rapportages aan andere contexts.

- **Poort:** 8002
- **Database:** `monitoring_db` (verslag: wide-column / DynamoDB voor sensordata)
- **Eigenaar:** _TBD_

## Verantwoordelijkheden
- Sensordata registreren per kunstwerk (trilling, belasting, temperatuur, slijtage).
- Data analyseren en afwijkingen detecteren (AnalyseService).
- Incidenten aanmaken met een ernst en het vervolg bepalen (inspectie / onderhoud / intensiever monitoren).
- Een MonitoringRapport opstellen voor Beheer (toetsing eisen) en Contract (KPI's).

## Ubiquitous language (uit het verslag)
Sensor · SensorType (Trilling/Belasting/Temperatuur/Slijtage) · SensorData ·
MonitoringSessie (aggregate) · MonitoringStatus (Actief/Gepauzeerd/Afgerond) · Afwijking ·
Incident (aggregate) · IncidentStatus (Nieuw/InBehandeling/Opgelost) ·
Ernst (Laag/Middel/Hoog/Kritiek) · MonitoringRapport ·
KunstwerkReferentie (verwijzing naar het kunstwerk in Beheer).

## Integratie
- **Publiceert:** `monitoring.meting.geregistreerd`, `monitoring.incident.aangemaakt`,
  `monitoring.incident.opgelost`, `monitoring.rapport.opgesteld`.
- **Consumeert:** `beheer.kunstwerk.geregistreerd`, `beheer.kunstwerk.buitengebruikgesteld`
  (weten welke kunstwerken gemonitord moeten worden).
- **Relaties:** supplier van **Onderhoud** en **Beheer**; **Contract** conformeert zich aan
  het monitoring-datamodel. Externe sensoren via een **Anti-Corruption Layer**.
- **REST:** `GET /api/metingen?kunstwerkId=...`, `GET /api/incidenten`.

## Draaien
Zie de [checklist in conventions.md](../docs/conventions.md#8-checklist--je-service-toevoegen).
