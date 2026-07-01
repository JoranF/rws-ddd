# Ontwerp — Monitoring-service (bounded context Monitoring)

_Datum: 2026-07-01 · Status: vastgesteld (ontwerp, vóór implementatie) · Eigenaar: Laurens_

> Leidend blijven de repo-docs: `/CLAUDE.md`, `/monitoring/CLAUDE.md`, `/docs/conventions.md`,
> `/docs/context-map.md`, `/docs/events.md`. Dit document legt het **implementatie-ontwerp**
> van de Monitoring-service vast. Bij tegenstrijdigheid over het domein winnen die docs
> (en het onderliggende DDD-verslag).

## 1. Doel & scope

De Monitoring-context verzamelt **sensordata** van RWS-kunstwerken, analyseert die op
**afwijkingen** en maakt bij een afwijking een **incident** aan met een ernst en een
vervolgactie-advies. Daarnaast stelt hij een **MonitoringRapport** op voor Beheer
(toetsing eisen) en Contract (KPI's). Monitoring past het kunstwerk zelf niet aan en
beslist niet over het onderhoud: een incident is een *feit* dat gepubliceerd wordt;
Onderhoud beslist wat ermee gebeurt. Verwijzing naar kunstwerken via **`kunstwerkId`**
(`KunstwerkReferentie`; bron van waarheid = Beheer), zonder beheer-model te kopiëren.

**Vaste kaders (uit conventions):** poort **8002** (`SERVICE_PORT`), DB **`monitoring_db`**
(`DATABASE_URL`), broker `rws.events` (`RABBITMQ_URL`), `GET /health` verplicht, REST onder
`/api`, events volgen de vaste envelope.

### Technische keuzes (vastgesteld)

| Onderwerp     | Keuze                                                              |
|---------------|--------------------------------------------------------------------|
| Taal          | Node.js + TypeScript (zelfde stack als Contract)                  |
| Framework     | Fastify + handmatige laagindeling (geen opinionated framework)    |
| Persistentie  | Prisma (schema-first, migraties) op de gedeelde Postgres (`monitoring_db`); modellen alleen in `infrastructure`. Het verslag stelt wide-column/DynamoDB voor — bewust uitgesteld naar Fase 2 (conventions §6 laat de gedeelde Postgres toe). |
| Domeinmodel   | Rijk: twee aggregates (MonitoringSessie, Incident) + domain service (AnalyseService) + write-once MonitoringRapport |
| Beheer-integratie | Consumer + lokaal read-model; validatie configureerbaar (soepel in Fase 1) |
| Testen        | TDD op `domain` + `application` met Vitest en in-memory fakes     |
| Bouwvolgorde  | Walking skeleton eerst, daarna domein verrijken (zelfde aanpak als Contract) |

## 2. Fasering

**Fase 1 — nu.** Alles wat Monitoring **zelf produceert**, als zelfstandig draaiende service:
walking skeleton, beide aggregates volledig, AnalyseService met afwijkingsdetectie,
MonitoringRapport, alle 4 gepubliceerde events, REST + OpenAPI, de
Beheer-`kunstwerk.*`-consumer met read-model (idempotent), Docker/compose. De
kunstwerk-validatie staat **soepel** (configureerbaar), zodat de service draait vóórdat
Beheer events publiceert. `POST /api/metingen` doet dienst als sensor-ingang.

**Fase 2 — later.** Echte Anti-Corruption-Layer-adapters voor externe sensorformaten
(polling/AMQP/file-feeds), de wide-column/DynamoDB-opslag voor sensordata, strenge
kunstwerk-validatie, automatisch afronden van sessies bij
`beheer.kunstwerk.buitengebruikgesteld`, configureerbare drempels per kunstwerk,
handmatige afwijkingsbevestiging, periodieke rapportage, transactionele outbox,
integratietests (Testcontainers) + deploy (Dokploy).

## 3. Architectuur & mapindeling

Vier lagen met de afhankelijkheidsregel naar binnen (`interface → application → domain`,
`infrastructure → domain/application`; `domain` hangt van niets af).

```
monitoring/
  src/
    domain/          aggregates, value objects, AnalyseService, domain events
    application/     use cases (commands/queries), ports, queries
    infrastructure/  Prisma-repos, RabbitMQ publisher/consumer, config, klok, id-generator
    interface/       Fastify-routes (/api), request/response-DTO's + validatie, OpenAPI, /health-route
    main.ts          composition root
  prisma/            schema.prisma + migraties
  test/              Vitest unit tests (domain + application + lichte infrastructure) + fakes
  package.json, tsconfig.json, vitest.config.ts, Dockerfile, .env(.example)
```

De bestaande top-level lagen-mappen (`monitoring/domain/` t/m `monitoring/interface/`)
behouden hun `CLAUDE.md`-guidance; de code zelf leeft onder `src/<laag>/` zodat één
`tsconfig`/build het geheel dekt — identiek aan de Contract-service.

**Kernprincipe:** `domain` is puur TypeScript — geen Prisma, geen Fastify, geen amqplib.
Inkomende events/DB-rijen worden aan de rand (`infrastructure`) vertaald naar domeintaal
(anti-corruption). De **composition root** (`src/main.ts`) bedraadt handmatig:
config → Prisma-client → repos → publisher → use cases → Fastify-routes → consumer.

## 4. Domeinmodel

Twee aggregates, een domain service en een write-once rapport.

### 4.1 Aggregate `MonitoringSessie`

Bewaakt het monitoren van één kunstwerk. **Metingen zitten bewust niet ín het aggregate**:
een sessie ontvangt onbegrensd veel metingen en zou anders bij elke meting de hele
historie laden. De sessie bewaakt de regels, de meting is een apart immutabel record.

- **Root `MonitoringSessie`:** `SessieId`, `kunstwerkId: KunstwerkReferentie`,
  `status: MonitoringStatus` (`Actief` ↔ `Gepauzeerd` → `Afgerond`), `gestartOp`,
  `beeindigdOp?`, `aantalMetingen` (teller, geen collectie).
- **`Meting`** (immutabel record, eigen `MetingRepository`, append-only):
  `MetingId`, `sessieId`, `kunstwerkId`, `sensorData: SensorData`, `tijdstip`.
  Wordt geregistreerd **via** de sessie: `sessie.registreerMeting(...)` bewaakt de
  invariant, verhoogt de teller, registreert het domain event en retourneert de meting
  die de use case apart persisteert.
- **Invarianten:**
  - Meten mag alleen bij status `Actief`.
  - Pauzeren alleen vanaf `Actief`; hervatten alleen vanaf `Gepauzeerd`.
  - Afronden vanaf `Actief` of `Gepauzeerd`; daarna geen mutaties meer.
  - Max. één niet-afgeronde sessie per kunstwerk (cross-aggregate-regel, afgedwongen in
    de use case via `zoekLopendeVoorKunstwerk`; een partial unique index dicht de
    race-conditie — Fase 2).
- **Domain events:** `MetingGeregistreerd` (het starten/pauzeren/afronden van een sessie
  kent geen integratie-event in de catalogus).

### 4.2 Aggregate `Incident`

Ontstaat uit een door de AnalyseService gedetecteerde afwijking (los aggregate; zie §6).

- **Root `Incident`:** `IncidentId`, `kunstwerkId`, de afwijkingsgegevens (`sensorType`,
  `gemetenWaarde`, `drempelwaarde`), `ernst: Ernst`, gegenereerde `omschrijving`
  (bv. _"Trilling van 7.5 mm/s overschrijdt drempel 5 mm/s"_),
  `vervolgactie: Vervolgactie`, `status: IncidentStatus`
  (`Nieuw` → `InBehandeling` → `Opgelost`; `Nieuw` → `Opgelost` mag ook),
  `aangemaaktOp`, `opgelostOp?`.
- **`Vervolgactie`** (`IntensieverMonitoren` / `Inspectie` / `Onderhoud`) is een
  **advies-feit**, afgeleid van de ernst in de factory: `Laag` → IntensieverMonitoren,
  `Middel` → Inspectie, `Hoog`/`Kritiek` → Onderhoud. Monitoring publiceert het incident
  als feit; de daadwerkelijke onderhoudsbeslissing ligt bij Onderhoud
  (zie `/monitoring/CLAUDE.md`).
- **Invarianten:**
  - In behandeling nemen alleen vanaf `Nieuw`.
  - Oplossen alleen vanaf `Nieuw` of `InBehandeling`; `Opgelost` is een eindtoestand.
- **Domain events:** `IncidentAangemaakt`, `IncidentOpgelost`.

### 4.3 Domain service `AnalyseService`

Puur (geen ports): `analyseer(sensorData, tijdstip): Afwijking | null`. Drempelmodel met
vaste domein-defaults (constructor-injecteerbaar voor tests):

| SensorType  | Drempel | Eenheid |
|-------------|---------|---------|
| Trilling    | 5       | mm/s    |
| Belasting   | 100     | kN      |
| Temperatuur | 40      | °C      |
| Slijtage    | 60      | %       |

Ernst uit de **overschrijdingsfactor** `f = waarde / drempel`: `f < 1` → geen afwijking;
`1 ≤ f < 1.25` → `Laag`; `1.25 ≤ f < 1.5` → `Middel`; `1.5 ≤ f < 2` → `Hoog`;
`f ≥ 2` → `Kritiek`. Elke afwijking leidt in Fase 1 direct tot een incident
(auto-bevestigd; handmatige bevestiging is een openstaand punt).

### 4.4 `MonitoringRapport`

Geen levenscyclus-aggregate maar een **write-once domeinobject met factory**:
`MonitoringRapport.stelOp(...)` berekent in het domein de `resultaten` (per sensorType
aantal/min/max/gemiddelde; incidenttellingen totaal/open/opgelost + `incidentIds`) over
een periode, kiest het zwaarste openstaande incident als `incidentId` (of `null`) en
registreert het event; daarna immutabel. Hergebruikt `AggregateRoot` voor de
event-mechaniek, zonder mutatiemethoden.

### 4.5 Gedeelde value objects

`KunstwerkReferentie` (verwijzing naar Beheer), `SessieId`/`MetingId`/`IncidentId`/`RapportId`,
`SensorType` (Trilling/Belasting/Temperatuur/Slijtage), `SensorData` (type + waarde;
de **eenheid ligt vast per SensorType** via `standaardEenheid` — de caller levert alleen
type + waarde), `Afwijking` (sensorType, gemetenWaarde, drempelwaarde, ernst, tijdstip),
`Ernst` (geordend: Laag < Middel < Hoog < Kritiek), `Vervolgactie`, `DomeinFout`.

## 5. Use cases (application) & ports

**Commands** (elk = één transactie, publiceert na persist zijn domain event(s)):

| Use case                    | Aggregate            | Publiceert                                          |
|-----------------------------|----------------------|-----------------------------------------------------|
| `StartMonitoringSessie`     | MonitoringSessie     | —                                                   |
| `PauzeerMonitoringSessie`   | MonitoringSessie     | —                                                   |
| `HervatMonitoringSessie`    | MonitoringSessie     | —                                                   |
| `RondMonitoringSessieAf`    | MonitoringSessie     | —                                                   |
| `RegistreerMeting`          | MonitoringSessie (+ maakt evt. Incident) | `monitoring.meting.geregistreerd` **en evt.** `monitoring.incident.aangemaakt` |
| `NeemIncidentInBehandeling` | Incident             | —                                                   |
| `LosIncidentOp`             | Incident             | `monitoring.incident.opgelost`                      |
| `StelRapportOp`             | MonitoringRapport    | `monitoring.rapport.opgesteld`                      |

**Queries:** `ZoekSessies`, `GetSessie(id)`, `ZoekMetingen(kunstwerkId, sensorType?)`,
`ZoekIncidenten(status?, kunstwerkId?)`, `GetIncident(id)`, `ZoekRapporten(kunstwerkId?)`,
`GetRapport(id)`.

**Ports (interfaces in `application`, geïmplementeerd in `infrastructure`):**
`MonitoringSessieRepository` (met `zoekLopendeVoorKunstwerk`), `MetingRepository`,
`IncidentRepository`, `RapportRepository`, `EventPublisher`, `KunstwerkenReadModel`
(query `isBekendEnInGebruik(kunstwerkId)`), `IdGenerator`, `Klok` (`nu(): Date` —
monitoring is tijd-intensief; een `VasteKlok`-fake maakt de TDD deterministisch).

`StartMonitoringSessie` gebruikt `KunstwerkenReadModel` om te controleren of het kunstwerk
bekend en in gebruik is. In Fase 1 is dit **soepel**: onbekend kunstwerk →
waarschuwing/log, geen blokkade (vlag `KUNSTWERK_VALIDATIE=soepel`). In Fase 2 → `streng`.
`RegistreerMeting` accepteert een `kunstwerkId` (sensoren kennen het kunstwerk, niet de
sessie) en zoekt de lopende sessie; geen lopende sessie → `DomeinFout`.

## 6. Transactiegrenzen & consistentie

- **Eén aggregate per transactie** als regel. `RegistreerMeting` raakt sessie (teller +
  event), meting (persist) en eventueel een nieuw `Incident`. Voor dit schoolproject doen
  we dit in één use case/transactie voor eenvoud (zelfde pragmatiek als Contract's
  `GunAanbesteding`), met de kanttekening dat de zuivere DDD-variant een event-handler op
  `MetingGeregistreerd` zou zijn (eventual consistency). Genoteerd als Fase 2-verbetering.
- **Events publiceren ná succesvolle persist.** Een **transactionele outbox** is de nette
  oplossing en staat genoteerd als latere verbetering; niet in Fase 1.
- **Consumers idempotent** via `VerwerktEvent` (dedupe op `eventId`).

## 7. Infrastructure

- **Prisma-schema** (`monitoring/prisma/schema.prisma`) met tabellen: `MonitoringSessie`,
  `Meting` (kunstwerkId gedenormaliseerd; index `[kunstwerkId, tijdstip]`), `Incident`
  (index `[kunstwerkId, status]`), `MonitoringRapport` (`resultaten Json`), read-model
  `BekendKunstwerk`, en `VerwerktEvent` (idempotentie). Meetwaarden als `Float` (geen
  geld, dus geen centen-conversie; `Decimal` genoteerd als alternatief).
- **Repo-implementaties** `PrismaMonitoringSessieRepository`, `PrismaMetingRepository`,
  `PrismaIncidentRepository`, `PrismaRapportRepository` — mappen rijen ↔ domeinobjecten;
  Prisma-typen blijven in deze laag.
- **`RabbitMqEventPublisher`** — implementeert `EventPublisher`; verpakt elk domain event
  in de envelope (`eventId` = uuid, `eventType` = routing key, `occurredAt` = ISO-8601 UTC,
  `producer` = `"monitoring"`, `version` = 1, `data`) en publiceert op de durable
  topic-exchange `rws.events` met routing key `monitoring.<aggregate>.<event>`.
- **`BeheerKunstwerkConsumer`** — eigen durable queue **`monitoring.beheer-kunstwerk`**
  gebonden op `beheer.kunstwerk.*`; idempotent via `VerwerktEvent`; vertaalt
  `geregistreerd` (upsert) en `buitengebruikgesteld` (markeer) naar het
  `BekendKunstwerk`-read-model (anti-corruption).
- **Config** (`SERVICE_PORT`, `DATABASE_URL`, `RABBITMQ_URL`, `KUNSTWERK_VALIDATIE`),
  logging (pino via Fastify), `SysteemKlok`, `UuidIdGenerator`, en de concrete
  **`/health`** (checkt DB- en broker-connectie).

### Event-payloads (bindend richting consumers)

| Routing key                        | `data`                                                                 |
|------------------------------------|------------------------------------------------------------------------|
| `monitoring.meting.geregistreerd`  | `kunstwerkId`, `sensorType`, `waarde`, `eenheid`, `tijdstip` (+ extra: `metingId`, `sessieId`) |
| `monitoring.incident.aangemaakt`   | `incidentId`, `kunstwerkId`, `ernst`, `omschrijving` (+ extra: `sensorType`, `vervolgactie`) |
| `monitoring.incident.opgelost`     | `incidentId`, `kunstwerkId`, `datum`                                   |
| `monitoring.rapport.opgesteld`     | `kunstwerkId`, `incidentId` (nullable, zwaarste open incident), `resultaten` |

Extra velden toevoegen is achterwaarts compatibel (events.md-regel). `ernst` als string
`Laag|Middel|Hoog|Kritiek`; tijden ISO-8601 UTC.

## 8. Interface (REST + OpenAPI)

Fastify, alle paden onder `/api`; validatie via Fastify JSON-schema; OpenAPI via
`@fastify/swagger` + `@fastify/swagger-ui` op `/api/docs`.

| Methode + pad                                | Use case / query               |
|----------------------------------------------|--------------------------------|
| `POST /api/sessies`                           | `StartMonitoringSessie`        |
| `POST /api/sessies/:id/pauzering`             | `PauzeerMonitoringSessie`      |
| `POST /api/sessies/:id/hervatting`            | `HervatMonitoringSessie`       |
| `POST /api/sessies/:id/afronding`             | `RondMonitoringSessieAf`       |
| `GET  /api/sessies` · `GET /api/sessies/:id`  | `ZoekSessies` / `GetSessie`    |
| `POST /api/metingen`                          | `RegistreerMeting`             |
| `GET  /api/metingen?kunstwerkId=…&sensorType=…` | `ZoekMetingen` (verplicht per README) |
| `POST /api/incidenten/:id/inbehandelingname`  | `NeemIncidentInBehandeling`    |
| `POST /api/incidenten/:id/oplossing`          | `LosIncidentOp`                |
| `GET  /api/incidenten?status=…&kunstwerkId=…` · `GET /api/incidenten/:id` | `ZoekIncidenten` / `GetIncident` (verplicht per README) |
| `POST /api/rapporten`                         | `StelRapportOp`                |
| `GET  /api/rapporten?kunstwerkId=…` · `GET /api/rapporten/:id` | `ZoekRapporten` / `GetRapport` |
| `GET  /health`                                | health-check (DB + broker)     |

Controllers zijn dun: ontvang → valideer → roep use case → map naar response. Geen
domeinregels in de interface-laag.

## 9. Teststrategie (Vitest, TDD)

- **domain:** value objects (`SensorData`-eenheden en -grenzen, id's),
  `MonitoringSessie`-statusovergangen + meten-alleen-bij-Actief,
  `Incident`-statusmachine + vervolgactie-afleiding, `AnalyseService`-grensgevallen
  (f = 1, 1.25, 1.5, 2), `MonitoringRapport`-berekening (samenvattingen, zwaarste incident).
- **application:** elke use case met in-memory fakes (`InMemory*Repository`,
  `FakeEventPublisher`, `FakeKunstwerkenReadModel`, `VasteIdGenerator`, `VasteKlok`);
  assert eindtoestand én de uitgestuurde events (mét en zonder afwijking).
- **licht (infrastructure):** envelope-mapping van de publisher (fake channel) en
  idempotentie/vertaling van de consumer (dedupe op `eventId`).
- **Buiten Fase 1:** DB-integratietests (Testcontainers) en API/e2e-tests — Fase 2.

## 10. Docker & lokaal draaien

- **Dockerfile** (Node, multi-stage): TypeScript builden → productie-image; bij start
  `prisma migrate deploy` en daarna de service op `SERVICE_PORT` (8002).
- **`.env`** afleiden van `.env.example` (voeg `KUNSTWERK_VALIDATIE=soepel` toe).
- Het `monitoring`-blok in `../docker-compose.yml` **uncommenten**; de service vindt
  `postgres` en `rabbitmq` op containernaam.
- Verificatie: `docker compose up --build`, dan `GET http://localhost:8002/health` → 200 en
  de OpenAPI-UI zichtbaar.

## 11. Buiten scope (Fase 1 / YAGNI)

- Wide-column/DynamoDB-opslag voor sensordata (verslag-suggestie) — gedeelde Postgres
  volstaat per conventions §6.
- Echte sensor-ACL-adapters; nu is `POST /api/metingen` de ingang.
- Transactionele outbox (nu: publish-na-persist) en opsplitsen van `RegistreerMeting`
  via een event-handler (eventual consistency).
- Strenge kunstwerk-validatie en automatisch afronden van lopende sessies bij
  `beheer.kunstwerk.buitengebruikgesteld` (nu alleen read-model-markering).
- Configureerbare drempelwaarden per kunstwerk/sensor; handmatige bevestiging van
  afwijkingen vóór incident-aanmaak.
- Geplande/periodieke rapportage (scheduler) — nu on-demand via REST.
- Partial unique index op "één lopende sessie per kunstwerk"; retentie/aggregatie van metingen.
- DB-integratietests, e2e-tests, Dokploy-deploy (Fase 2). Authenticatie/autorisatie (niet in de opdracht).

## 12. Openstaande punten

- **`monitoring.rapport.opgesteld`:** events.md definieert een enkelvoudig `incidentId`,
  maar een rapport kan meerdere incidenten dekken. Voorstel: `incidentId` = zwaarste
  openstaande incident (of `null`) + `incidentIds` binnen `resultaten`. Bevestigen met het
  team — Contract conformeert zich aan dit datamodel.
- **Drempelwaarden en eenheden per SensorType** zijn aannames; aanpasbaar zonder
  gevolgen voor de rest van het ontwerp.
- **"Bevestigde afwijking"** (README): Fase 1 bevestigt automatisch (elke afwijking →
  incident); eventueel een handmatige bevestigingsstap later.
- **Sessie-granulariteit:** één sessie dekt alle sensortypes van een kunstwerk (niet per
  sensor) — simpelste model; bevestigen.
