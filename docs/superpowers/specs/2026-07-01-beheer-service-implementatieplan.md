# Implementatieplan - Beheer-service

_Datum: 2026-07-01. Status: geimplementeerd t/m acceptatiecriteria stap 11. Context: Beheer._

> Bronnen: `/README.md`, `/CLAUDE.md`, `/docs/ontwerp.md`,
> `/docs/context-map.md`, `/docs/events.md`, `/docs/conventions.md`,
> `/docs/dokploy.md`, `/beheer/README.md`, `/beheer/CLAUDE.md`, de
> laag-`CLAUDE.md` bestanden in `/beheer`, het Contract-service ontwerp en het
> DDD-verslag `docs/DDD verslag, Laurens, Sven, Joran, Kaleb.docx`.
>
> Bij tegenstrijdigheid over het domein wint het DDD-verslag. Bij
> tegenstrijdigheid over integratie winnen `events.md`, `context-map.md` en
> `conventions.md`.

## Implementatiestatus

Dit plan is uitgevoerd in `/beheer` met:

- FastAPI composition root in `beheer/infrastructure/main.py`.
- Domeinmodel, value objects, domain events en `EisenValidator` in
  `beheer/domain`.
- Commands, queries, ports en transactiegrenzen in `beheer/application`.
- SQLAlchemy repositories, Alembic migratie en `verwerkt_event` in
  `beheer/infrastructure`.
- REST routes en Pydantic DTO's in `beheer/interface`.
- RabbitMQ publisher en consumers voor de verplichte routing keys.
- Pytest-tests voor domain, application en envelope mapping in `beheer/tests`.
- Definitieve `beheer/Dockerfile`, `.env.example` en geactiveerd
  `beheer`-blok in `docker-compose.yml`.

## 1. Doel en scope

Beheer is de bounded context voor het kunstwerk-register, de administratie van
kunstwerken en de eisen waarmee Rijkswaterstaat de levenscyclus van kunstwerken
bewaakt. Beheer is de bron van waarheid voor `KunstwerkId`; andere contexts mogen
wel naar dat ID verwijzen, maar beheren het kunstwerkmodel niet zelf.

De eerste bruikbare implementatie van Beheer doet vijf dingen:

1. Kunstwerken registreren, wijzigen, tonen en buiten gebruik stellen of
   afkeuren.
2. Onderhoudseisen en ontwerpeisen vaststellen, versioneren en beschikbaar maken
   voor andere contexts.
3. Netwerkrapportages uit Monitoring beoordelen tegen de actuele ontwerpeisen.
4. Onderhoudsrapporten uit Onderhoud beoordelen tegen de actuele
   onderhoudseisen.
5. Integreren via REST en RabbitMQ-events volgens de published language.

Beheer blijft daarbij geen simpele upstream-service. Volgens de context map is
Beheer:

- supplier van Contract voor kunstwerkgegevens en eisen;
- customer van Monitoring voor netwerkrapportages;
- partner van Onderhoud voor onderhoudseisen en onderhoudsrapporten;
- eigenaar van `KunstwerkId` en de basisadministratie.

Niet in scope voor fase 1:

- Direct lezen of schrijven in databases van Contract, Monitoring of Onderhoud.
- Een API-gateway, authenticatie/autorisatie of gedeelde codebibliotheek.
- Volledige documentopslag voor rapportages. Fase 1 bewaart alleen de
  gestructureerde waarden die nodig zijn voor beoordeling.
- Een aparte Ontwerp-context. Ontwerpeisen blijven voorlopig onderdeel van
  Beheer, zoals in het DDD-verslag is gekozen.
- Transactionele outbox. Events worden na succesvolle database-transactie
  gepubliceerd; de outbox blijft een latere verbetering.

## 2. Technische keuze

Het DDD-verslag noemt voor Beheer een Python-service met een relationele
database. Het repo-skelet gebruikt lokaal Postgres, terwijl productie eventueel
MySQL kan worden. De implementatie moet daarom op `DATABASE_URL` sturen en geen
Postgres-specifieke domeinkeuzes afdwingen.

| Onderwerp | Keuze |
| --- | --- |
| Taal | Python 3.12 |
| Webframework | FastAPI |
| Validatie en DTO's | Pydantic v2 |
| ORM en migraties | SQLAlchemy 2 + Alembic |
| Database | Relationeel via `DATABASE_URL`; lokaal `beheer_db` op Postgres |
| Broker | RabbitMQ topic exchange `rws.events` |
| RabbitMQ client | `pika` met een sync adapter aan de infrastructuurrand |
| Tests | pytest, met in-memory fakes voor domain/application |
| Poort | `SERVICE_PORT=8004` |

Minimale environment variables:

```text
SERVICE_PORT=8004
DATABASE_URL=postgresql+psycopg://rws:rws@postgres:5432/beheer_db
RABBITMQ_URL=amqp://rws:rws@rabbitmq:5672
ENABLE_RABBITMQ_CONSUMERS=true
```

## 3. Architectuur en mapindeling

Gebruik de bestaande DDD-laagindeling uit `conventions.md` en de
`beheer/*/CLAUDE.md` bestanden.

```text
beheer/
  domain/          aggregates, value objects, domain events, repository ports
  application/     use cases, command/query DTO's, transacties, event-publisher port
  infrastructure/  SQLAlchemy repos, Alembic, RabbitMQ, config, health, composition root
  interface/       FastAPI routes, request/response schemas, event-handler adapters
  tests/           domain/application/infrastructure tests
  alembic/         migraties
  pyproject.toml
  Dockerfile
  .env.example
```

Afhankelijkheidsregel:

- `domain` hangt nergens van af.
- `application` gebruikt alleen `domain` en poorten/interfaces.
- `interface` vertaalt HTTP/events naar use cases en bevat geen bedrijfsregels.
- `infrastructure` implementeert repositories, RabbitMQ, configuratie en health.
- Externe payloads worden aan de rand vertaald naar Beheer-taal.

## 4. Domeinmodel

### 4.1 Aggregate `Kunstwerk`

`Kunstwerk` is de aggregate root voor de basisadministratie. Het ID is stabiel en
wordt door andere contexts gebruikt als referentie.

Velden:

- `kunstwerkId`
- `naam`
- `type`: bijvoorbeeld `Brug`, `Sluis`, `Tunnel`, `Snelweg`, `Dijk`, `Gemaal`,
  `Stormvloedkering`
- `locatie`
- `status`
- optioneel: `beheerder`, `jaarRenovatie`, `laatsteInspectiedatum`
- auditvelden: `aangemaaktOp`, `gewijzigdOp`

Statussen voor fase 1:

- `Geregistreerd`
- `InGebruik`
- `BuitenGebruik`
- `Afgekeurd`

Invarianten:

- `kunstwerkId` is uniek en verandert nooit.
- `naam`, `type`, `locatie` en `status` zijn verplicht.
- Alleen een bestaand kunstwerk kan buiten gebruik worden gesteld.
- Buiten gebruik stellen vereist een reden en datum.
- Een kunstwerk kan niet tweemaal buiten gebruik worden gesteld.
- Andere contexts krijgen alleen het ID en gepubliceerde basisvelden.

Domain events:

- `KunstwerkGeregistreerd`
- `KunstwerkBuitengebruikgesteld`

Published events:

- `beheer.kunstwerk.geregistreerd`
- `beheer.kunstwerk.buitengebruikgesteld`

### 4.2 Aggregate `Eisenpakket`

Een `Eisenpakket` legt onderhoudseisen of ontwerpeisen vast voor een kunstwerk.
Dit aggregate staat los van `Kunstwerk`, omdat eisen onafhankelijk versioneren.

Velden:

- `eisenpakketId`
- `kunstwerkId`
- `soort`: `Onderhoudseisen` of `Ontwerpeisen`
- `versie`
- `status`: `Concept`, `Vastgesteld`, `Vervangen`
- `eisen`: lijst van `Eis`
- `vastgesteldOp`
- optioneel: `onderhoudsstrategie`

Value object `Eis`:

- `code`
- `omschrijving`
- `meetwaarde`
- `operator`: bijvoorbeeld `<`, `<=`, `>`, `>=`, `=`
- `grenswaarde`
- `eenheid`

Invarianten:

- Een vastgesteld eisenpakket bevat minimaal een eis.
- Per kunstwerk en soort is er maximaal een huidig vastgesteld eisenpakket.
- Een nieuwe vaststelling vervangt de vorige versie van dezelfde soort.
- Onderhoudseisen worden gebruikt voor onderhoudsrapporten.
- Ontwerpeisen worden gebruikt voor netwerkrapportages.
- De gebruikte eisenversie blijft achteraf herleidbaar.

Domain events:

- `OnderhoudseisenVastgesteld`
- `OntwerpeisenVastgesteld`

Published events:

- `beheer.onderhoudseisen.vastgesteld`
- `beheer.ontwerpeisen.vastgesteld`

### 4.3 Aggregate `RapportageBeoordeling`

Een `RapportageBeoordeling` registreert hoe Beheer een rapport uit een andere
context heeft beoordeeld. Zo worden inkomende events geen losse logs, maar
herleidbare domeinfeiten.

Rapportagetypen:

- `Netwerkrapportage` uit `monitoring.rapport.opgesteld`
- `Onderhoudsrapport` uit `onderhoud.onderhoud.afgerond`

Velden:

- `beoordelingId`
- `externRapportId`
- `bronEventId`
- `kunstwerkId`
- `rapportageType`
- `ontvangenOp`
- `eisenpakketId`
- `resultaat`: `Voldoet`, `VoldoetNiet`, `NietTeBeoordelen`
- `bevindingen`

Invarianten:

- Een rapportage wordt gekoppeld aan een bestaand `kunstwerkId`.
- Beoordelen kan alleen met een huidig vastgesteld eisenpakket van het juiste
  soort.
- De beoordeling bewaart welke eisenversie is gebruikt.
- Dubbele events worden niet opnieuw beoordeeld.
- Het domein kent geen RabbitMQ-envelope; die hoort in `infrastructure`.

### 4.4 Domain service `EisenValidator`

`EisenValidator` vergelijkt rapportwaarden met de eisen uit een vastgesteld
eisenpakket.

Verantwoordelijkheden:

- Per eis bepalen of de rapportwaarde voldoet aan operator en grenswaarde.
- Ontbrekende meetwaarden als bevinding markeren.
- Een eindresultaat bepalen:
  - alle eisen voldoen -> `Voldoet`;
  - minstens een harde eis faalt -> `VoldoetNiet`;
  - geen bruikbare rapportwaarden of geen eisenpakket -> `NietTeBeoordelen`.

Fase 1 start met numerieke vergelijkingen. Tekstuele beoordelingen,
wegingsfactoren en handmatige overrides zijn latere uitbreidingen.

## 5. Application use cases

Een use case is de transactiegrens. Use cases laden aggregates via repository
interfaces, roepen domeinmethodes aan, slaan de nieuwe toestand op en publiceren
domain events via een `EventPublisher` poort nadat de database-transactie is
geslaagd.

Commands:

| Use case | Verantwoordelijkheid | Publiceert |
| --- | --- | --- |
| `RegistreerKunstwerk` | Nieuw kunstwerk aanmaken | `beheer.kunstwerk.geregistreerd` |
| `WijzigKunstwerkBasisgegevens` | Naam, locatie of administratieve velden wijzigen | geen integratie-event in fase 1 |
| `StelKunstwerkBuitenGebruik` | Kunstwerk buiten gebruik stellen met reden | `beheer.kunstwerk.buitengebruikgesteld` |
| `StelOnderhoudseisenVast` | Nieuwe onderhoudseisen vaststellen en vorige versie vervangen | `beheer.onderhoudseisen.vastgesteld` |
| `StelOntwerpeisenVast` | Nieuwe ontwerpeisen vaststellen en vorige versie vervangen | `beheer.ontwerpeisen.vastgesteld` |
| `VerwerkMonitoringRapport` | Netwerkrapportage beoordelen tegen ontwerpeisen | geen event in fase 1 |
| `VerwerkOnderhoudAfgerond` | Onderhoudsrapport beoordelen tegen onderhoudseisen | geen event in fase 1 |

Queries:

- `ZoekKunstwerken`
- `GetKunstwerk`
- `GetEisenVoorKunstwerk`
- `GetLaatsteOnderhoudseisen`
- `GetLaatsteOntwerpeisen`
- `ZoekRapportageBeoordelingen`
- `GetRapportageBeoordeling`

Poorten/interfaces:

- `KunstwerkRepository`
- `EisenpakketRepository`
- `RapportageBeoordelingRepository`
- `EventPublisher`
- `UnitOfWork`
- `Clock`
- `IdGenerator`

## 6. REST-interface

Alle endpoints staan onder `/api`, behalve `/health`. FastAPI publiceert OpenAPI
automatisch.

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
| `GET /api/kunstwerken/{kunstwerkId}/onderhoudseisen` | `GetLaatsteOnderhoudseisen` |
| `GET /api/kunstwerken/{kunstwerkId}/ontwerpeisen` | `GetLaatsteOntwerpeisen` |
| `GET /api/rapportage-beoordelingen` | `ZoekRapportageBeoordelingen` |
| `GET /api/rapportage-beoordelingen/{beoordelingId}` | `GetRapportageBeoordeling` |
| `GET /health` | Healthcheck voor service, database en broker |

HTTP-statussen:

- `201 Created` bij registratie en eisenvaststelling.
- `200 OK` bij queries en succesvolle wijzigingen.
- `404 Not Found` bij onbekend `kunstwerkId` of `beoordelingId`.
- `409 Conflict` bij domeininvariant-conflicten.
- `422 Unprocessable Entity` bij request-validatiefouten.
- `503 Service Unavailable` bij healthcheck-falen.

## 7. Event-integratie

### 7.1 Publiceren

Alle events gebruiken exact de envelope uit `docs/events.md`.

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

Exchange:

- naam: `rws.events`
- type: topic
- durable: ja

Routing keys en minimale payload:

| Routing key | Data |
| --- | --- |
| `beheer.kunstwerk.geregistreerd` | `kunstwerkId`, `type`, `locatie`, `status` |
| `beheer.kunstwerk.buitengebruikgesteld` | `kunstwerkId`, `reden`, `datum` |
| `beheer.onderhoudseisen.vastgesteld` | `kunstwerkId`, `eisen` |
| `beheer.ontwerpeisen.vastgesteld` | `kunstwerkId`, `eisen` |

Eventnaam, routing key en `eventType` blijven gelijk.

### 7.2 Consumeren

Verplichte consumers voor fase 1:

| Routing key | Doel |
| --- | --- |
| `monitoring.rapport.opgesteld` | Netwerkrapportage beoordelen tegen ontwerpeisen |
| `onderhoud.onderhoud.afgerond` | Onderhoudsrapport beoordelen tegen onderhoudseisen |

Consumerregels:

- Gebruik per consumer een eigen durable queue.
- Bind op exacte routing keys, niet op `#`, tenzij voor lokale debugging.
- Sla ieder verwerkt `eventId` op in `verwerkt_event`.
- Een dubbel `eventId` wordt geacknowledged maar niet opnieuw verwerkt.
- Vertaal de envelope in `infrastructure` naar een use-case-aanroep.
- Laat het `domain` nooit RabbitMQ-, JSON- of envelope-objecten kennen.

Fase 2-optie:

- Consumeer `contract.onderhoudscontract.gegund` zodat Beheer administratief kan
  vastleggen dat een kunstwerk onder contract staat. `events.md` noemt dit als
  relevant voor Beheer, maar de Beheer-README maakt het nog niet verplicht.

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
  buitengebruik_reden
  buitengebruik_datum
  created_at
  updated_at

eisenpakket
  id
  kunstwerk_id
  soort
  versie
  status
  onderhoudsstrategie
  vastgesteld_op
  created_at
  updated_at

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
  extern_rapport_id
  bron_event_id
  kunstwerk_id
  rapportage_type
  eisenpakket_id
  resultaat
  ontvangen_op
  created_at

rapportage_bevinding
  id
  beoordeling_id
  eis_code
  meetwaarde
  operator
  grenswaarde
  eenheid
  resultaat
  toelichting

verwerkt_event
  event_id
  event_type
  occurred_at
  processed_at
```

Ontwerpkeuzes:

- Bewaar rapportages in fase 1 als gestructureerde beoordeling, niet als volledig
  document.
- Houd `kunstwerk_id` als foreign key binnen de eigen Beheer-database.
- Andere contexts krijgen geen database-toegang; zij gebruiken REST of events.
- Type-specifieke kunstwerktabellen uit het verslag zijn een latere uitbreiding.
- Een documentdatabase voor rapportages blijft optioneel voor fase 2 of later.

## 9. Bouwfasering

### Fase 0 - Voorbereiding

Taken:

- Maak `pyproject.toml` met FastAPI, uvicorn, Pydantic, SQLAlchemy, Alembic,
  pytest en RabbitMQ-client.
- Voeg `beheer/.env.example` toe met `SERVICE_PORT`, `DATABASE_URL` en
  `RABBITMQ_URL`.
- Maak een composition root, bijvoorbeeld `beheer/infrastructure/main.py`.
- Zorg dat imports de laagindeling volgen.

Resultaat:

- De service kan lokaal starten zonder domeinfunctionaliteit.
- `python -m pytest` draait, ook als er nog weinig tests zijn.

### Fase 1 - Walking skeleton

Taken:

- Bouw FastAPI-app met `GET /health`.
- Laat `/health` minimaal configuratie laden en later DB/broker controleren.
- Maak Dockerfile voor Python-service.
- Laat de service luisteren op `SERVICE_PORT=8004`.
- Controleer dat OpenAPI zichtbaar is.

Resultaat:

- `GET http://localhost:8004/health` geeft `200 OK` zodra de service draait.
- Het beheer-blok in `docker-compose.yml` kan worden geactiveerd zodra de
  Dockerfile klaar is.

### Fase 2 - Domein

Taken:

- Implementeer value objects:
  - `KunstwerkId`
  - `Locatie`
  - `KunstwerkType`
  - `KunstwerkStatus`
  - `EisenSoort`
  - `Eis`
  - `RapportageResultaat`
- Implementeer aggregates:
  - `Kunstwerk`
  - `Eisenpakket`
  - `RapportageBeoordeling`
- Implementeer domain events zonder transportdetails.
- Implementeer `EisenValidator`.
- Schrijf pytest-tests voor alle invarianten.

Resultaat:

- Domeinlogica is volledig testbaar zonder FastAPI, SQLAlchemy of RabbitMQ.

### Fase 3 - Application layer

Taken:

- Implementeer alle commands en queries uit hoofdstuk 5.
- Definieer repository-, unit-of-work- en event-publisher interfaces.
- Maak in-memory fakes voor application tests.
- Publiceer domain events alleen via de `EventPublisher` interface.
- Test per use case de eindtoestand en de uitgestuurde events.

Resultaat:

- De volledige Beheer-functionaliteit werkt met in-memory repositories.

### Fase 4 - Persistentie

Taken:

- Configureer SQLAlchemy engine en sessies via `DATABASE_URL`.
- Maak Alembic migraties voor de tabellen uit hoofdstuk 8.
- Implementeer repository-adapters.
- Map database-rijen naar domain objecten.
- Voeg `verwerkt_event` toe voor idempotentie.
- Breid `/health` uit met een database-check.

Resultaat:

- Beheer bewaart kunstwerken, eisen en beoordelingen in `beheer_db`.

### Fase 5 - REST API

Taken:

- Implementeer alle endpoints uit hoofdstuk 6.
- Voeg Pydantic request- en responsemodellen toe.
- Map domeinfouten naar `404`, `409` of `422`.
- Houd controllers dun: receive -> validate -> use case -> response.
- Documenteer endpoints via FastAPI/OpenAPI.

Resultaat:

- Contract, Monitoring en Onderhoud kunnen Beheer synchroon bevragen.

### Fase 6 - RabbitMQ publiceren

Taken:

- Implementeer `RabbitMqEventPublisher`.
- Declareer exchange `rws.events` durable.
- Map domain events naar de envelope uit `events.md`.
- Publiceer de vier Beheer-events met de juiste routing key.
- Test envelope-mapping met een fake RabbitMQ-channel.

Resultaat:

- Beheer publiceert events die door andere contexts kunnen worden geconsumeerd.

### Fase 7 - RabbitMQ consumeren en rapportagebeoordeling

Taken:

- Implementeer consumers voor:
  - `monitoring.rapport.opgesteld`
  - `onderhoud.onderhoud.afgerond`
- Maak queues durable en consumer-idempotentie verplicht.
- Vertaal monitoringpayloads naar `Netwerkrapportage`.
- Vertaal onderhoudpayloads naar `Onderhoudsrapport`.
- Roep `VerwerkMonitoringRapport` en `VerwerkOnderhoudAfgerond` aan.
- Sla `RapportageBeoordeling` en `RapportageBevinding` op.

Resultaat:

- Beheer beoordeelt rapportages tegen de juiste actuele eisenversie.

### Fase 8 - Integratie, Docker en deploy

Taken:

- Maak Dockerfile definitief.
- Activeer het beheer-blok in `docker-compose.yml` wanneer de service werkt.
- Test met RabbitMQ en Postgres uit de lokale compose-stack.
- Voeg rooktest-commands toe aan `beheer/README.md`.
- Deploy later volgens `docs/dokploy.md` als losse Dokploy Application met build
  path `/beheer`.

Resultaat:

- Beheer draait lokaal en is klaar voor onafhankelijke Dokploy-deploy.

## 10. Teststrategie

Domain tests:

- `KunstwerkId` validatie.
- Statusovergangen van `Kunstwerk`.
- Buiten gebruik stellen met reden en datum.
- Eisenpakket-versies en "maximaal een huidig vastgesteld pakket".
- Numerieke vergelijkingslogica van `EisenValidator`.
- Beoordeling `Voldoet`, `VoldoetNiet` en `NietTeBeoordelen`.

Application tests:

- `RegistreerKunstwerk` slaat op en publiceert het juiste event.
- `StelKunstwerkBuitenGebruik` bewaakt de statusinvariant.
- `StelOnderhoudseisenVast` vervangt de vorige actuele versie.
- `StelOntwerpeisenVast` publiceert de juiste eventdata.
- `VerwerkMonitoringRapport` gebruikt ontwerpeisen.
- `VerwerkOnderhoudAfgerond` gebruikt onderhoudseisen.
- Dubbele `bronEventId`s leiden niet tot dubbele beoordelingen.

Infrastructure tests:

- Repository roundtrip voor `Kunstwerk`.
- Repository roundtrip voor `Eisenpakket` inclusief `Eis`.
- Repository roundtrip voor `RapportageBeoordeling`.
- RabbitMQ envelope mapping.
- Consumer-idempotentie via `verwerkt_event`.

E2E rooktest:

1. Start Postgres, RabbitMQ en Beheer.
2. Registreer een kunstwerk via REST.
3. Stel onderhoudseisen en ontwerpeisen vast.
4. Controleer dat de drie events worden gepubliceerd.
5. Publiceer een fake `monitoring.rapport.opgesteld` event.
6. Publiceer een fake `onderhoud.onderhoud.afgerond` event.
7. Controleer dat twee rapportagebeoordelingen zijn opgeslagen.

## 11. Acceptatiecriteria

De eerste bruikbare Beheer-service is klaar als:

- `GET /health` op poort `8004` `200 OK` teruggeeft.
- `POST /api/kunstwerken` een kunstwerk registreert.
- `GET /api/kunstwerken/{kunstwerkId}` dezelfde gegevens teruggeeft.
- `PATCH /api/kunstwerken/{kunstwerkId}` basisgegevens kan aanpassen.
- `POST /api/kunstwerken/{kunstwerkId}/buitengebruikstelling` een kunstwerk
  buiten gebruik stelt en het event publiceert.
- Onderhoudseisen en ontwerpeisen kunnen worden vastgesteld en geversioneerd.
- De vier Beheer-events worden gepubliceerd volgens `docs/events.md`.
- Consumers voor Monitoring en Onderhoud idempotent zijn.
- Een monitoringrapport tot een beoordeling tegen ontwerpeisen leidt.
- Een onderhoudsrapport tot een beoordeling tegen onderhoudseisen leidt.
- Domain- en application-tests slagen.
- De Dockerfile de service start zonder lokale ontwikkelservertrucs.

## 12. Openstaande punten

- Exacte velden voor `locatie`: begin met string, later eventueel coordinaten,
  regio, traject of hectometerpaal.
- Exacte operatoren en datatypes voor eisen: fase 1 start numeriek, tekstuele
  beoordeling is later.
- Of Beheer in fase 1 al `contract.onderhoudscontract.gegund` moet consumeren.
  De eventcatalogus noemt dat Beheer kan vastleggen dat een kunstwerk onder
  contract staat, maar de Beheer-README verplicht het nog niet.
- Of `Onderhoudsstrategie` een apart aggregate moet worden. Fase 1 bewaart dit
  als optioneel veld bij onderhoudseisen.
- Of status `Afgekeurd` apart van `BuitenGebruik` moet blijven. Het verslag
  noemt beide conceptueel; implementatie kan ze apart houden voor audit.
- Of productie voor Beheer echt MySQL wordt. De code moet via `DATABASE_URL`
  blijven werken, zodat lokaal Postgres en later MySQL mogelijk blijven.
