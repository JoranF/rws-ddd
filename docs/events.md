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
Voorbeelden: `beheer.object.geregistreerd`, `monitoring.melding.aangemaakt`,
`onderhoud.werkorder.afgerond`. Consumers mogen wildcards binden, bv.
`beheer.object.*` of `#` voor alles.

## Envelope (verplicht)
Elk event is JSON met deze buitenkant. De context-specifieke data zit in `data`.

```json
{
  "eventId": "b3f1c2de-...",          // uuid, uniek per event (voor idempotentie)
  "eventType": "beheer.object.geregistreerd",
  "occurredAt": "2026-07-01T12:00:00Z", // ISO-8601 UTC
  "producer": "beheer",                 // welke context het publiceerde
  "version": 1,                         // schemaversie van dit eventType
  "data": { }                           // payload, zie per event hieronder
}
```

## Regels
- **Idempotent consumeren:** gebruik `eventId` om dubbele verwerking te voorkomen
  (RabbitMQ garandeert *at-least-once*).
- **Alleen ID's + eigen taal:** verwijs naar objecten van een andere context via hun ID
  (`objectId`), niet door hun hele model te kopiëren.
- **Achterwaarts compatibel:** velden toevoegen mag; verwijderen/hernoemen betekent
  `version` ophogen en dit document bijwerken.
- **Vertaal aan de rand:** een consumer zet het event in `infrastructure` om naar een
  use-case-aanroep; laat de envelope niet doorlekken naar `domain`.

## Eventcatalogus (startpunt — vul aan als eigenaar)

| Routing key                          | Producer   | Belangrijkste `data`-velden                         |
|--------------------------------------|------------|-----------------------------------------------------|
| `beheer.object.geregistreerd`        | Beheer     | `objectId`, `type`, `locatie`, `status`             |
| `beheer.object.buitengebruikgesteld` | Beheer     | `objectId`, `reden`, `datum`                        |
| `contract.contract.afgesloten`       | Contract   | `contractId`, `objectId`, `aannemer`, `periode`     |
| `contract.contract.beeindigd`        | Contract   | `contractId`, `objectId`, `datum`                   |
| `monitoring.meting.geregistreerd`    | Monitoring | `objectId`, `sensor`, `waarde`, `tijdstip`          |
| `monitoring.melding.aangemaakt`      | Monitoring | `meldingId`, `objectId`, `ernst`, `omschrijving`    |
| `onderhoud.werkorder.aangemaakt`     | Onderhoud  | `werkorderId`, `objectId`, `aanleiding`             |
| `onderhoud.werkorder.afgerond`       | Onderhoud  | `werkorderId`, `objectId`, `resultaat`, `datum`     |

De eigenaar van een context beheert zijn eigen rijen: houd namen en velden hier actueel
zodat andere teams erop kunnen bouwen.
