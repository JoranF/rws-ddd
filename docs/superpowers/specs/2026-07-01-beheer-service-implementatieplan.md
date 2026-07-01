# Implementatieplan - Beheer-service

_Datum: 2026-07-01. Status: voorstel voor implementatie. Context: Beheer._

> Leidend blijven `/README.md`, `/CLAUDE.md`, `/docs/conventions.md`,
> `/docs/context-map.md`, `/docs/events.md`, `/beheer/README.md`,
> `/beheer/CLAUDE.md` en het DDD-verslag
> `docs/DDD verslag, Laurens, Sven, Joran, Kaleb.docx`.
> Dit plan vertaalt die documenten naar een bouwvolgorde voor de Beheer-service.

## 1. Doel en scope

Beheer is de bounded context voor het kunstwerk-register en de eisen rond
kunstwerken. De service is de bron van waarheid voor `KunstwerkId`, basisgegevens
van kunstwerken, onderhoudseisen en ontwerpeisen.

Beheer doet in deze implementatie vier dingen:

1. Kunstwerken registreren, wijzigen, tonen en buiten gebruik stellen.
2. Onderhoudseisen en ontwerpeisen vaststellen en versioneren.
3. Netwerkrapportages van Monitoring en onderhoudsrapporten van Onderhoud
   beoordelen tegen de laatst vastgestelde eisen.
4. Integratie-events publiceren en consumeren volgens de published language.

Niet in scope voor de eerste implementatie:

- Volledige documentenopslag voor rapportages. We bewaren de gestructureerde
  meetwaarden die nodig zijn voor validatie.
- Directe toegang tot databases van andere bounded contexts.
- Een API-gateway, authenticatie/autorisatie of gedeelde codebibliotheek.
- Een aparte Ontwerp-context. Ontwerpeisen blijven voorlopig in Beheer, zoals het
  verslag beschrijft.

## 2. Technische keuze

Het DDD-verslag noemt voor Beheer Python en een relationele database. De service
wordt daarom bij voorkeur gebouwd met:

| Onderwerp | Keuze |
| --- | --- |
| Taal | Python 3.12 |
| Webframework | FastAPI |
| Validatie/DTO's | Pydantic |
| ORM/migraties | SQLAlchemy + Alembic |
| Database | MySQL in productie mogelijk; lokaal voorlopig `beheer_db` via `DATABASE_URL` |
| Broker | RabbitMQ topic exchange `rws.events` |
| Tests | pytest, met in-memory fakes voor domain/application |

Belangrijk: de code moet alleen op `DATABASE_URL` vertrouwen. Daardoor kan lokaal
Postgres uit `docker-compose.yml` gebruikt worden, terwijl de Beheer-eigenaar later
zonder domeinwijzigingen naar MySQL kan wisselen.

## 3. Architectuur en mappen

Houd de bestaande DDD-laagindeling aan:

```text
beheer/
  domain/          aggregates, value objects, domain events, repository ports
  application/     use cases, command/query DTO's, transacties, event-publisher port
  infrastructure/  SQLAlchemy repos, Alembic, RabbitMQ, config, health, composition root
  interface/       FastAPI routes, request/response schemas, event handlers
  tests/           domain/application/infrastructure tests
```

Afhankelijkheden:

- `domain` hangt nergens van af.
- `application` gebruikt alleen `domain` en poorten/interfaces.
- `interface` roept use cases aan en bevat geen bedrijfsregels.
- `infrastructure` implementeert repositories, RabbitMQ en database-adapters.

## 4. Domeinmodel

### 4.1 Aggregate `Kunstwerk`

`Kunstwerk` is de bron voor de stabiele referentie die andere contexts gebruiken.

Velden:

- `kunstwerkId`
- `naam`
- `type` zoals `Brug`, `Sluis`, `Tunnel`, `Snelweg`, `Dijk`, `Gemaal`,
  `Stormvloedkering`
- `locatie`
- `status`
- optioneel: `beheerder`, `jaarRenovatie`, `laatsteInspectiedatum`

Statusvoorstel:

- `Geregistreerd`
- `InGebruik`
- `BuitenGebruik`
- `Afgekeurd`

Invarianten:

- `kunstwerkId` is uniek en verandert nooit.
- `naam`, `type`, `locatie` en `status` zijn verplicht.
- Een kunstwerk kan maar een keer buiten gebruik worden gesteld.
- Buiten gebruik stellen vereist een reden en datum.
- Andere contexts krijgen alleen het `kunstwerkId` en basisvelden, nooit interne
  Beheer-tabellen.

Domain events:

- `KunstwerkGeregistreerd`
- `KunstwerkBuitengebruikgesteld`

Published events:

- `beheer.kunstwerk.geregistreerd`
- `beheer.kunstwerk.buitengebruikgesteld`

### 4.2 Aggregate `Eisenpakket`

Een `Eisenpakket` legt onderhoudseisen of ontwerpeisen vast voor een kunstwerk.
Dit is bewust los van `Kunstwerk`, omdat eisen versioneren en onafhankelijk opnieuw
vastgesteld kunnen worden.

Velden:

- `eisenpakketId`
- `kunstwerkId`
- `soort`: `Onderhoudseisen` of `Ontwerpeisen`
- `versie`
- `status`: `Concept`, `Vastgesteld`, `Vervangen`
- `eisen`: lijst van `Eis`
- `vastgesteldOp`

Value object `Eis`:

- `code`
- `omschrijving`
- `meetwaarde`
- `operator`: bijvoorbeeld `<=`, `>=`, `=`
- `grenswaarde`
- `eenheid`

Invarianten:

- Een vastgesteld eisenpakket bevat minimaal een eis.
- Per kunstwerk en soort is er maximaal een huidig vastgesteld eisenpakket.
- Een nieuwe vaststelling vervangt de vorige versie van dezelfde soort.
- `Onderhoudseisen` worden gebruikt voor onderhoudsrapporten.
- `Ontwerpeisen` worden gebruikt voor netwerkrapportages van Monitoring.

Domain events:

- `OnderhoudseisenVastgesteld`
- `OntwerpeisenVastgesteld`

Published events:

- `beheer.onderhoudseisen.vastgesteld`
- `beheer.ontwerpeisen.vastgesteld`

### 4.3 Aggregate `RapportageBeoordeling`

Een `RapportageBeoordeling` registreert hoe Beheer een binnengekomen rapport heeft
beoordeeld. Dit voorkomt dat inkomende events direct alleen logs worden.

Rapportagetypen:

- `Netwerkrapportage` uit `monitoring.rapport.opgesteld`
- `Onderhoudsrapport` uit `onderhoud.onderhoud.afgerond`

Velden:

- `beoordelingId`
- `rapportId` of extern referentieveld
- `kunstwerkId`
- `rapportageType`
- `ontvangenOp`
- `eisenpakketId`
- `resultaat`: `Voldoet`, `VoldoetNiet`, `NietTeBeoordelen`
- `bevindingen`

Invarianten:

- Een rapportage wordt altijd aan een bestaand `kunstwerkId` gekoppeld.
- Beoordelen kan alleen als er een huidig vastgesteld eisenpakket van het juiste
  soort bestaat.
- De beoordeling bewaart welke eisenversie is gebruikt.
- Dubbele events worden niet opnieuw beoordeeld; idempotentie loopt via `eventId`.

## 5. Application use cases

Commands:

| Use case | Verantwoordelijkheid | Publiceert |
| --- | --- | --- |
| `RegistreerKunstwerk` | Nieuw kunstwerk aanmaken | `beheer.kunstwerk.geregistreerd` |
| `WijzigKunstwerkBasisgegevens` | Naam, locatie of administratieve velden wijzigen | geen integratie-event in fase 1 |
| `StelKunstwerkBuitenGebruik` | Kunstwerk buiten gebruik stellen met reden | `beheer.kunstwerk.buitengebruikgesteld` |
| `StelOnderhoudseisenVast` | Nieuw onderhoudseisenpakket vaststellen | `beheer.onderhoudseisen.vastgesteld` |
| `StelOntwerpeisenVast` | Nieuw ontwerpeisenpakket vaststellen | `beheer.ontwerpeisen.vastgesteld` |
| `VerwerkMonitoringRapport` | Netwerkrapportage beoordelen tegen ontwerpeisen | geen nieuw event in fase 1 |
| `VerwerkOnderhoudAfgerond` | Onderhoudsrapport beoordelen tegen onderhoudseisen | eventueel vervolgactie intern |

Queries:

- `ZoekKunstwerken`
- `GetKunstwerk`
- `GetEisenVoorKunstwerk`
- `GetLaatsteOnderhoudseisen`
- `GetLaatsteOntwerpeisen`
- `ZoekRapportageBeoordelingen`

Poorten/interfaces:

- `KunstwerkRepository`
- `EisenpakketRepository`
- `RapportageBeoordelingRepository`
- `EventPublisher`
- `UnitOfWork`

Een use case is de transactiegrens. Domain events worden verzameld tijdens de use
case en gepubliceerd nadat de database-transactie succesvol is afgerond.

## 6. REST-interface

Alle endpoints staan onder `/api`, behalve `/health`.

| Methode + pad | Use case/query |
| --- | --- |
| `POST /api/kunstwerken` | `RegistreerKunstwerk` |
| `GET /api/kunstwerken` | `ZoekKunstwerken` |
| `GET /api/kunstwerken/{kunstwerkId}` | `GetKunstwerk` |
| `PATCH /api/kunstwerken/{kunstwerkId}` | `WijzigKunstwerkBasisgegevens` |
| `POST /api/kunstwerken/{kunstwerkId}/buitengebruikstelling` | `StelKunstwerkBuitenGebruik` |
| `POST /api/kunstwerken/{kunstwerkId}/onderhoudseisen` | `StelOnderhoudseisenVast` |
| `POST /api/kunstwerken/{kunstwerkId}/ontwerpeisen` | `StelOntwerpeisenVast` |
| `GET /api/kunstwerken/{kunstwerkId}/eisen` | `GetEisenVoorKunstwerk` |
| `GET /api/rapportage-beoordelingen` | `ZoekRapportageBeoordelingen` |
| `GET /health` | Healthcheck voor service, database en broker |

FastAPI levert automatisch OpenAPI. De interface-laag valideert input en roept
daarna alleen application use cases aan.

## 7. Event-integratie

### Publiceren

Gebruik de envelope uit `docs/events.md` exact:

```json
{
  "eventId": "uuid",
  "eventType": "beheer.kunstwerk.geregistreerd",
  "occurredAt": "2026-07-01T12:00:00Z",
  "producer": "beheer",
  "version": 1,
  "data": {}
}
```

Routing keys:

- `beheer.kunstwerk.geregistreerd`
- `beheer.kunstwerk.buitengebruikgesteld`
- `beheer.onderhoudseisen.vastgesteld`
- `beheer.ontwerpeisen.vastgesteld`

Payloads volgen minimaal de velden uit `docs/events.md`:

- Kunstwerk geregistreerd: `kunstwerkId`, `type`, `locatie`, `status`
- Kunstwerk buiten gebruik gesteld: `kunstwerkId`, `reden`, `datum`
- Onderhoudseisen vastgesteld: `kunstwerkId`, `eisen`
- Ontwerpeisen vastgesteld: `kunstwerkId`, `eisen`

### Consumeren

Verplichte consumers:

| Routing key | Doel |
| --- | --- |
| `monitoring.rapport.opgesteld` | Netwerkrapportage beoordelen tegen ontwerpeisen |
| `onderhoud.onderhoud.afgerond` | Onderhoudsrapport beoordelen tegen onderhoudseisen |

Consumerregels:

- Iedere consumer gebruikt een eigen durable queue.
- Iedere consumer schrijft `eventId` naar `verwerkt_event`.
- Een dubbel `eventId` wordt geacknowledged maar niet opnieuw verwerkt.
- De envelope wordt in `infrastructure` vertaald naar een use-case-aanroep.
- Het domain krijgt geen RabbitMQ- of JSON-envelope objecten te zien.

Optioneel fase 2:

- `contract.onderhoudscontract.gegund` consumeren om administratief vast te leggen
  dat een kunstwerk onder onderhoudscontract staat. De Beheer-README noemt dit nog
  niet als consumer, maar `docs/events.md` noemt wel dat Beheer dit kan vastleggen.

## 8. Database-ontwerp

Relationeel minimum voor fase 1:

```text
kunstwerk
  id
  naam
  type
  locatie
  status
  beheerder
  jaar_renovatie
  laatste_inspectiedatum
  created_at
  updated_at

eisenpakket
  id
  kunstwerk_id
  soort
  versie
  status
  vastgesteld_op
  created_at

eis
  id
  eisenpakket_id
  code
  omschrijving
  meetwaarde
  operator
  grenswaarde
  eenheid

rapportage_beoordeling
  id
  rapport_id
  kunstwerk_id
  rapportage_type
  eisenpakket_id
  resultaat
  bevindingen_json
  ontvangen_op
  created_at

verwerkt_event
  event_id
  event_type
  occurred_at
  processed_at
```

Latere uitbreiding:

- Type-specifieke kunstwerktabellen zoals in het verslag genoemd.
- Documentopslag voor volledige rapportages.
- Transactionele outbox voor gegarandeerde event-publicatie na database-commit.

## 9. Bouwfasering

### Fase 0 - Voorbereiding

- Maak Python-projectstructuur in `beheer/`.
- Voeg `requirements.txt` of `pyproject.toml` toe.
- Maak `main.py` of een composition root in `infrastructure`.
- Configureer `SERVICE_PORT`, `DATABASE_URL`, `RABBITMQ_URL`.

Resultaat: project installeert en start lokaal.

### Fase 1 - Walking skeleton

- FastAPI-app met `GET /health`.
- Dockerfile omzetten naar de Python-variant.
- `beheer/.env.example` behouden en eventueel uitbreiden.
- Basale OpenAPI zichtbaar.
- In-memory repository of lege DB-check voor eerste rooktest.

Resultaat: `docker compose up --build` kan Beheer starten zodra het compose-blok
wordt geuncomment.

### Fase 2 - Domein en unit tests

- Implementeer value objects: `KunstwerkId`, `Locatie`, `Eis`, `EisenSoort`,
  `KunstwerkStatus`, `ValidatieResultaat`.
- Implementeer aggregates `Kunstwerk`, `Eisenpakket`, `RapportageBeoordeling`.
- Voeg domain events toe zonder RabbitMQ-details.
- Schrijf pytest-tests voor alle invarianten.

Resultaat: domeinlogica is los van framework en database testbaar.

### Fase 3 - Application layer

- Implementeer commands en queries.
- Gebruik repositories en `EventPublisher` als interfaces.
- Voeg in-memory fakes toe voor application tests.
- Test per use case de eindtoestand en gepubliceerde domain events.

Resultaat: de service kan functioneel werken zonder echte adapters.

### Fase 4 - Persistentie

- Voeg SQLAlchemy modellen en Alembic migraties toe.
- Implementeer repository-adapters.
- Map database-rijen naar domain objecten, niet andersom door ORM-objecten in het
  domain te lekken.
- Voeg `verwerkt_event` toe voor idempotentie.

Resultaat: Beheer bewaart kunstwerken, eisen en beoordelingen in `beheer_db`.

### Fase 5 - REST API

- Implementeer alle endpoints uit hoofdstuk 6.
- Voeg request/response DTO's toe.
- Geef duidelijke HTTP-statussen terug:
  - `201` bij registratie/vaststelling
  - `200` bij queries
  - `404` bij onbekend `kunstwerkId`
  - `409` bij domeininvariant-conflict
  - `422` bij validatiefouten

Resultaat: Contract, Monitoring en Onderhoud kunnen Beheer via REST gebruiken.

### Fase 6 - RabbitMQ

- Implementeer `RabbitMqEventPublisher`.
- Maak exchange `rws.events` durable aan.
- Publiceer de vier Beheer-events met correcte routing key en envelope.
- Implementeer consumers voor `monitoring.rapport.opgesteld` en
  `onderhoud.onderhoud.afgerond`.
- Test envelope-mapping en idempotentie.

Resultaat: Beheer doet mee aan de published language.

### Fase 7 - Rapportagevalidatie

- Bouw `EisenValidator` als domain service.
- Vertaal monitoring- en onderhoudspayloads in infrastructure naar interne
  rapportwaarden.
- Vergelijk rapportwaarden met de juiste actuele eisenversie.
- Sla `RapportageBeoordeling` op met bevindingen.

Resultaat: Beheer kan onderbouwen of een rapportage voldoet of niet.

### Fase 8 - Integratie en deploy

- Maak Dockerfile definitief.
- Uncomment het Beheer-blok in `docker-compose.yml` wanneer de service werkt.
- Test lokaal:
  - `GET http://localhost:8004/health`
  - kunstwerk registreren
  - eisen vaststellen
  - event-publicatie op RabbitMQ
  - idempotente event-consumptie
- Deploy later volgens `docs/dokploy.md`.

## 10. Teststrategie

Domain tests:

- `KunstwerkId` validatie.
- Statusovergangen van `Kunstwerk`.
- Eisenpakket-versies en "maximaal een huidig vastgesteld pakket".
- Vergelijkingslogica van `EisenValidator`.

Application tests:

- `RegistreerKunstwerk` slaat op en publiceert event.
- `StelOnderhoudseisenVast` vervangt vorige actuele versie.
- `StelOntwerpeisenVast` publiceert de juiste eventdata.
- `VerwerkMonitoringRapport` maakt een beoordeling tegen ontwerpeisen.
- `VerwerkOnderhoudAfgerond` maakt een beoordeling tegen onderhoudseisen.

Infrastructure tests:

- RabbitMQ envelope mapping.
- Consumer-idempotentie via `eventId`.
- Repository roundtrip voor `Kunstwerk`, `Eisenpakket` en `RapportageBeoordeling`.

E2E rooktest:

- Start database, RabbitMQ en Beheer.
- Registreer een kunstwerk via REST.
- Stel onderhoudseisen vast.
- Publiceer een fake `onderhoud.onderhoud.afgerond` event.
- Controleer dat een rapportagebeoordeling is opgeslagen.

## 11. Acceptatiecriteria

De eerste bruikbare versie van Beheer is klaar als:

- `GET /health` 200 teruggeeft op poort `8004`.
- `POST /api/kunstwerken` een kunstwerk registreert.
- `GET /api/kunstwerken/{kunstwerkId}` dezelfde gegevens teruggeeft.
- Beheer `beheer.kunstwerk.geregistreerd` publiceert volgens de envelope.
- Onderhoudseisen en ontwerpeisen kunnen worden vastgesteld.
- De twee eisen-events worden gepubliceerd volgens `docs/events.md`.
- Consumers dubbele `eventId`s negeren.
- Een monitoringrapport of onderhoudsrapport tot een opgeslagen beoordeling leidt.
- Tests voor domain en application slagen.
- De Dockerfile de service start zonder lokale ontwikkelservertrucs.

## 12. Openstaande punten

- Exacte velden voor `locatie`: string in fase 1, later eventueel coordinaten,
  traject, hectometerpaal of regio.
- Exacte operatoren en datatypes voor eisen: begin met numerieke grenswaarden,
  breid later uit als rapportages tekstuele beoordeling nodig hebben.
- Of Beheer in fase 1 al `contract.onderhoudscontract.gegund` moet consumeren.
  De eventcatalogus suggereert dit, maar de Beheer-service README noemt het nog
  niet als verplichte consumer.
- Of status `Afgekeurd` apart van `BuitenGebruik` moet blijven. Het verslag noemt
  beide conceptueel; implementatie kan ze apart houden voor duidelijkere audit.
