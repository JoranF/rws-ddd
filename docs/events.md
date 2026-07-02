# Event-contract (Published Language)

De asynchrone integratie tussen contexts loopt via **domain events** op RabbitMQ. Dit
document is het bindende contract: de vorm ligt vast, iedereen houdt zich eraan.

## Broker & exchange
- Broker: RabbitMQ (`RABBITMQ_URL`, standaard `amqp://rws:rws@rabbitmq:5672`).
- Eén **topic exchange**: `rws.events` (durable).
- Elke consumer maakt zijn **eigen queue** aan en bindt met de routing keys die hij nodig
  heeft. Zo blijven producers onwetend van hun consumers (losse koppeling).

## Routing key
```
<context>.<aggregate>.<event>
```
Voorbeelden: `beheer.kunstwerk.geregistreerd`, `monitoring.incident.aangemaakt`,
`contract.onderhoudscontract.gegund`. Consumers mogen wildcards binden, bv.
`beheer.kunstwerk.*` of `#` voor alles.

## Envelope (verplicht)
Elk event is JSON met deze buitenkant. De context-specifieke data zit in `data`.

```json
{
  "eventId": "b3f1c2de-...",          // uuid, uniek per event (voor idempotentie)
  "eventType": "beheer.kunstwerk.geregistreerd",
  "occurredAt": "2026-07-01T12:00:00Z", // ISO-8601 UTC
  "producer": "beheer",                 // welke context het publiceerde
  "version": 1,                         // schemaversie van dit eventType
  "data": { }                           // payload, zie per event hieronder
}
```

## Regels
- **Idempotent consumeren:** gebruik `eventId` om dubbele verwerking te voorkomen
  (RabbitMQ garandeert *at-least-once*).
- **Alleen ID's + eigen taal:** verwijs naar een kunstwerk van een andere context via zijn ID
  (`kunstwerkId`), niet door zijn hele model te kopiëren.
- **Achterwaarts compatibel:** velden toevoegen mag; verwijderen/hernoemen betekent
  `version` ophogen en dit document bijwerken.
- **Vertaal aan de rand:** een consumer zet het event in `infrastructure` om naar een
  use-case-aanroep; laat de envelope niet doorlekken naar `domain`.

## Eventcatalogus (afgeleid uit het verslag — vul aan als eigenaar)

Namen volgen de events uit het DDD-verslag (o.a. de Contract-berichten en de flows uit de
event storming), gemapt op het routing-key-schema `<context>.<aggregate>.<event>`.

| Routing key                              | Producer   | Belangrijkste `data`-velden                             |
|------------------------------------------|------------|---------------------------------------------------------|
| `beheer.kunstwerk.geregistreerd`         | Beheer     | `kunstwerkId`, `type`, `locatie`, `status`              |
| `beheer.kunstwerk.buitengebruikgesteld`  | Beheer     | `kunstwerkId`, `reden`, `datum`                         |
| `beheer.onderhoudseisen.vastgesteld`     | Beheer     | `kunstwerkId`, `eisen`                                  |
| `beheer.ontwerpeisen.vastgesteld`        | Beheer     | `kunstwerkId`, `eisen`                                  |
| `contract.aanbesteding.gepubliceerd`     | Contract   | `aanbestedingId`, `kunstwerkId`, `sluitingsdatum`, `gunningscriteria` |
| `contract.inschrijving.ontvangen`        | Contract   | `aanbestedingId`, `aannemer`, `prijs`, `kwaliteitsscore`|
| `contract.aanbesteding.gegund`           | Contract   | `aanbestedingId`, `winnendeAannemer`, `emviScore`       |
| `contract.onderhoudscontract.gegund`     | Contract   | `contractId`, `kunstwerkId`, `opdrachtnemer`, `looptijd` |
| `contract.wijziging.goedgekeurd`         | Contract   | `contractId`, `bedrag`, `reden`, `datum`                |
| `contract.prestatieverklaring.opgesteld` | Contract   | `contractId`, `periode`, `score`, `bedrag`              |
| `contract.onderhoudscontract.afgerond`   | Contract   | `contractId`, `kunstwerkId`, `datum`                    |
| `monitoring.meting.geregistreerd`        | Monitoring | `kunstwerkId`, `sensorType`, `waarde`, `eenheid`, `tijdstip` |
| `monitoring.incident.aangemaakt`         | Monitoring | `incidentId`, `kunstwerkId`, `ernst`, `omschrijving`    |
| `monitoring.incident.opgelost`           | Monitoring | `incidentId`, `kunstwerkId`, `datum`                    |
| `monitoring.rapport.opgesteld`           | Monitoring | `kunstwerkId`, `incidentId`, `resultaten`               |
| `monitoring.netwerkrapportage.opgesteld` | Monitoring | `periode` {start,eind}, `opgesteldOp`, `kunstwerken[]` (`kunstwerkId`, `aantalMetingen`, `aantalIncidenten`, `zwaarsteErnst`) |
| `onderhoud.storing.gemeld`               | Onderhoud  | `storingId`, `kunstwerkId`, `omschrijving`              |
| `onderhoud.onderhoud.gestart`            | Onderhoud  | `onderhoudId`, `kunstwerkId`, `datum`                   |
| `onderhoud.onderhoud.afgerond`           | Onderhoud  | `onderhoudId`, `kunstwerkId`, `resultaat`, `datum`      |
| `onderhoud.contractaanvraag.ingediend`   | Onderhoud  | `kunstwerkId`, `aanleiding`                             |

- `ernst` volgt de enum uit het verslag: **Laag / Middel / Hoog / Kritiek**.
- `contract.onderhoudscontract.gegund` is voor de rest het belangrijkste event: Onderhoud
  weet dan welke aannemer aan welk kunstwerk mag werken; Beheer legt vast dat het kunstwerk
  onder contract staat.
- `onderhoud.onderhoud.afgerond` levert het onderhoudsrapport terug aan Beheer (partnership).

De eigenaar van een context beheert zijn eigen rijen: houd namen en velden hier actueel
zodat andere teams erop kunnen bouwen.
