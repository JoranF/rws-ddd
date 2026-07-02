# Ontwerp — Monitoring-service in C# / .NET (Fase 1 + Fase 2)

_Datum: 2026-07-02 · Status: vastgesteld (ontwerp, vóór implementatie) · Stack: C# / .NET 10_

> Dit document **hertaalt** het bestaande, goedgekeurde ontwerp
> `docs/superpowers/specs/2026-07-01-monitoring-service-design.md` (Node/Fastify/Prisma)
> naar **C# / .NET 10**, en voegt de Fase 2-integratieonderdelen toe. Het domein en het
> gedrag zijn **ongewijzigd**: bij twijfel over domeinsemantiek wint het originele ontwerp
> + de repo-docs (`/CLAUDE.md`, `/monitoring/CLAUDE.md`, `/docs/conventions.md`,
> `/docs/context-map.md`, `/docs/events.md`, `/docs/vervolgstappen.md`). Dit document legt
> de **technologie- en structuurkeuzes** voor de .NET-implementatie vast en spiegelt de
> patronen van de reeds gebouwde **Contract**-service (envelope, outbox+relay, idempotente
> consumer, Testcontainers).

## 1. Doel & scope

De Monitoring-context verzamelt **sensordata** van RWS-kunstwerken, analyseert die op
**afwijkingen**, maakt bij een afwijking een **incident** aan (met ernst + vervolgactie-advies),
en stelt **rapportages** op voor Beheer (netwerkrapportage) en Contract (KPI's). Monitoring
past het kunstwerk niet aan en beslist niet over onderhoud: een incident is een *feit* dat
gepubliceerd wordt. Verwijzing naar kunstwerken via **`kunstwerkId`** (`KunstwerkReferentie`;
bron van waarheid = Beheer).

**Vaste kaders (conventions):** poort **8002** (`SERVICE_PORT`), DB **`monitoring_db`**
(`DATABASE_URL`), broker `rws.events` (`RABBITMQ_URL`), `GET /health` verplicht, REST onder
`/api`, events volgen de vaste envelope.

**Scope = volledig (Fase 1 + Fase 2)**, gelijk aan waar Contract staat:
- **Fase 1:** twee aggregates (MonitoringSessie + Incident), AnalyseService, MonitoringRapport,
  de 4 gepubliceerde events, REST + OpenAPI, idempotente `beheer.kunstwerk.*`-consumer met
  read-model, Docker + compose-blok.
- **Fase 2:** `KUNSTWERK_VALIDATIE=streng`, **transactionele outbox + relay** (i.p.v.
  publish-na-persist), **netwerkrapportage naar Beheer** (nieuw event), Testcontainers-
  integratietests. (Dokploy-deploy blijft optioneel/handmatig, buiten deze scope.)

### Vastgestelde techniekkeuzes

| Onderwerp        | Keuze                                                                        |
|------------------|------------------------------------------------------------------------------|
| Taal / runtime   | **C# / .NET 10** (`net10.0`), ASP.NET Core                                    |
| Solutiestructuur | **Multi-project**: 1 csproj per laag; afhankelijkheidsregel via `<ProjectReference>` compile-afgedwongen |
| Persistentie     | **EF Core 10 + Npgsql** op gedeelde Postgres (`monitoring_db`); code-first migraties |
| Messaging        | **RabbitMQ.Client (raw)** — volledige controle over exchange/routing/envelope; 1-op-1 gelijk aan Contract |
| Serialisatie     | **`System.Text.Json`**, camelCase — byte-compatibel met de cross-language envelope |
| Interface        | **Minimal APIs** (`MapGroup("/api")`) + ingebouwde OpenAPI (`Microsoft.AspNetCore.OpenApi`) + **Scalar** UI op `/api/docs` |
| Testen           | **xUnit** (unit met in-memory fakes) + **Testcontainers voor .NET** (integratie, Fase 2) |
| Bouwvolgorde     | Walking skeleton → domein (TDD) → application (fakes) → infrastructure → interface + composition root → Fase 2 → Docker |

## 2. Solutie-opzet (multi-project, compile-afgedwongen lagen)

```
monitoring/
  Monitoring.sln
  src/
    Monitoring.Domain/          # refs: GEEN. Pure C#. → dwingt "domain hangt van niets af" af
    Monitoring.Application/     # refs: Domain
    Monitoring.Infrastructure/  # refs: Domain, Application  (+ EF Core, Npgsql, RabbitMQ.Client)
    Monitoring.Api/             # refs: Application, Infrastructure  (ASP.NET Core host)
  test/
    Monitoring.UnitTests/       # refs: Domain, Application  (xUnit + fakes)
    Monitoring.IntegrationTests/# refs: Api, Infrastructure  (xUnit + Testcontainers)
  Dockerfile
  .env.example
  .dockerignore
```

De bestaande `monitoring/<laag>/CLAUDE.md`-mappen (`domain/`, `application/`, `infrastructure/`,
`interface/`) blijven bestaan als **laag-guidance**; de code leeft in `src/Monitoring.<Laag>/`.
De `<ProjectReference>`-graaf is de laaggrens: `Monitoring.Domain` heeft **nul** referenties en
kan dus geen framework/DB/broker importeren — de afhankelijkheidsregel wordt door de compiler
bewaakt i.p.v. door discipline.

**Naamgeving:** `interface` uit conventions = het ASP.NET Core-project `Monitoring.Api` ("Api"
is idiomatischer in .NET dan "Interface" en botst niet met het C#-sleutelwoord `interface`).

## 3. Domeinmodel (`Monitoring.Domain`)

Alle domeinsemantiek (invarianten, statusmachines, drempels, ernst-grenzen, rapport-berekening)
is **letterlijk** die uit het originele ontwerp §4 — hier alleen de C#-vormgeving.

- **Value objects** als `sealed record` met **private constructor** + statische `Van(...)`-factory
  die de invariant bewaakt en `DomeinFout` gooit. Waarde-gelijkheid gratis via `record`.
  - `KunstwerkReferentie`, `SessieId`, `MetingId`, `IncidentId`, `RapportId` (elk: niet-leeg).
  - `SensorData` (`SensorType` + `Waarde`; eenheid vast per type via `StandaardEenheid`;
    weigert negatief behalve Temperatuur, slijtage 0–100).
  - `Afwijking` (sensorType, gemetenWaarde, drempelwaarde, ernst, tijdstip; `Omschrijving`).
- **Enums:** `SensorType {Trilling,Belasting,Temperatuur,Slijtage}`, `Ernst {Laag,Middel,Hoog,Kritiek}`
  (geordend via helper), `MonitoringStatus {Actief,Gepauzeerd,Afgerond}`,
  `IncidentStatus {Nieuw,InBehandeling,Opgelost}`, `Vervolgactie {IntensieverMonitoren,Inspectie,Onderhoud}`.
- **`DomeinFout : Exception`** — domeinregel-schending.
- **`AggregateRoot`** (basisklasse) — spiegelt Contract:
  ```csharp
  public abstract class AggregateRoot {
      private readonly List<IDomainEvent> _events = new();
      protected void RegistreerEvent(IDomainEvent e) => _events.Add(e);
      public IReadOnlyList<IDomainEvent> TrekEventsLeeg() {
          var uit = _events.ToList(); _events.Clear(); return uit;
      }
  }
  ```
- **`IDomainEvent`** = `{ string EventType; IReadOnlyDictionary<string, object?> Data; }`. Vier
  concrete records: `MetingGeregistreerd`, `IncidentAangemaakt`, `IncidentOpgelost`,
  `RapportOpgesteld` (+ Fase 2 `NetwerkrapportageOpgesteld`). `Data` = precies de
  `data`-velden uit `docs/events.md`, aangevuld met achterwaarts-compatibele extra velden.
- **`MonitoringSessie` : AggregateRoot** — factory `Start(...)`, `Herstel(...)` (voor repo,
  zonder events); statusmachine Actief↔Gepauzeerd→Afgerond; `RegistreerMeting(...)` bewaakt
  "alleen bij Actief", verhoogt teller, geeft immutabel `Meting`-record terug en registreert
  `monitoring.meting.geregistreerd`. **Metingen zitten bewust niet in het aggregate** (alleen
  een teller); `Meting` is een los append-only record met eigen repository.
- **`Incident` : AggregateRoot** — factory `MaakAan(afwijking)` leidt `Vervolgactie` uit ernst
  af (Laag→IntensieverMonitoren, Middel→Inspectie, Hoog/Kritiek→Onderhoud); statusmachine
  Nieuw→InBehandeling→Opgelost (Nieuw→Opgelost mag); events `IncidentAangemaakt` /
  `IncidentOpgelost`.
- **`AnalyseService`** (domain service, puur, geen ports) — `Analyseer(SensorData, DateTime) : Afwijking?`.
  Drempels: Trilling 5 mm/s, Belasting 100 kN, Temperatuur 40 °C, Slijtage 60 %
  (constructor-injecteerbaar voor tests/Fase 2). Ernst uit overschrijdingsfactor
  `f = waarde/drempel`: `f<1`→geen; `1≤f<1.25`→Laag; `1.25≤f<1.5`→Middel; `1.5≤f<2`→Hoog; `f≥2`→Kritiek.
- **`MonitoringRapport`** — write-once via `StelOp(...)`: berekent per sensortype
  (aantal/min/max/gemiddelde) + incidenttellingen (totaal/open/opgelost + `incidentIds`) over
  een periode, kiest het **zwaarste openstaande** incident als `incidentId` (of `null`),
  registreert `monitoring.rapport.opgesteld`; daarna immutabel.

## 4. Application (`Monitoring.Application`) — use cases + ports

**Commands** (elk = één transactie; events worden via de outbox weggeschreven, zie §6):

| Use case                    | Aggregate                                 | Publiceert (via outbox)                                        |
|-----------------------------|-------------------------------------------|---------------------------------------------------------------|
| `StartMonitoringSessie`     | MonitoringSessie                          | —                                                             |
| `PauzeerMonitoringSessie`   | MonitoringSessie                          | —                                                             |
| `HervatMonitoringSessie`    | MonitoringSessie                          | —                                                             |
| `RondMonitoringSessieAf`    | MonitoringSessie                          | —                                                             |
| `RegistreerMeting`          | MonitoringSessie (+ evt. Incident)        | `monitoring.meting.geregistreerd` **en evt.** `monitoring.incident.aangemaakt` |
| `NeemIncidentInBehandeling` | Incident                                  | —                                                             |
| `LosIncidentOp`             | Incident                                  | `monitoring.incident.opgelost`                               |
| `StelRapportOp`             | MonitoringRapport                         | `monitoring.rapport.opgesteld`                              |
| `StelNetwerkrapportageOp` (Fase 2) | (aggregatie over kunstwerken/periode)| `monitoring.netwerkrapportage.opgesteld`                    |

Use cases zijn klassen met via de constructor geïnjecteerde ports (geen service locator),
`UitvoerenAsync(command)`; foutafhandeling via `DomeinFout` die opborrelt.

**Queries:** `ZoekSessies`/`GetSessie`, `ZoekMetingen(kunstwerkId, sensorType?)`,
`ZoekIncidenten(status?, kunstwerkId?)`/`GetIncident`, `ZoekRapporten(kunstwerkId?)`/`GetRapport`.

**Ports (interfaces in Application, impl. in Infrastructure):**
`IMonitoringSessieRepository` (met `ZoekLopendeVoorKunstwerkAsync`), `IMetingRepository`
(append-only), `IIncidentRepository`, `IRapportRepository`, `IEventPublisher`
(`Task PubliceerAsync(IReadOnlyList<IDomainEvent>)`), `IKunstwerkenReadModel`
(`Task<bool> IsBekendEnInGebruikAsync(KunstwerkReferentie)`), `IIdGenerator` (`string Nieuw()`),
`IKlok` (`DateTime Nu()` — met `VasteKlok`-fake voor deterministische TDD).

**Validatie-posture:** `StartMonitoringSessie` en `RegistreerMeting` raadplegen
`IKunstwerkenReadModel`. **Soepel** (default, kan blijven): onbekend kunstwerk → waarschuwing/log,
geen blokkade. **Streng** (Fase 2, `KUNSTWERK_VALIDATIE=streng`): onbekend/buitengebruikgesteld
kunstwerk → `DomeinFout`. De vlag wordt als een enum/bool aan de use cases meegegeven (zoals
Contract dat doet met `validatie: 'soepel' | 'streng'`).

## 5. Infrastructure (`Monitoring.Infrastructure`)

### 5.1 EF Core (Npgsql) — `MonitoringDbContext`

Tabellen (code-first, `dotnet ef migrations`):
- `MonitoringSessie` (Id, KunstwerkId, Status, GestartOp, BeeindigdOp?, AantalMetingen).
- `Meting` (Id, SessieId, KunstwerkId **gedenormaliseerd**, SensorType, Waarde `double`,
  Eenheid, Tijdstip) — index `(KunstwerkId, Tijdstip)`, append-only.
- `Incident` (Id, KunstwerkId, SensorType, GemetenWaarde, Drempelwaarde, Ernst, Omschrijving,
  Vervolgactie, Status, AangemaaktOp, OpgelostOp?) — index `(KunstwerkId, Status)`.
- `MonitoringRapport` (Id, KunstwerkId, PeriodeStart, PeriodeEind, IncidentId?, `Resultaten jsonb`,
  OpgesteldOp).
- `BekendKunstwerk` (read-model: KunstwerkId `@id`, Type?, Locatie?, InGebruik `bool` default true,
  BijgewerktOp).
- `VerwerktEvent` (idempotentie: EventId `@id`, VerwerktOp) — dedupe op `eventId`.
- **`OutboxMessage`** (Fase 2: Id = eventId, EventType, RoutingKey, `Payload jsonb` = volledige
  envelope, Gepubliceerd `bool` default false, AangemaaktOp, GepubliceerdOp?) — index
  `(Gepubliceerd, AangemaaktOp)`.

Meetwaarden als `double` (geen geld → geen centen-conversie). Repos mappen rijen ↔ domeinobjecten
via de `Herstel(...)`-factories (Npgsql-typen blijven in deze laag).

### 5.2 RabbitMQ.Client (raw)

- **`RabbitMqConnectie`** — verbindt, maakt kanaal, `ExchangeDeclare("rws.events", topic, durable)`.
- **Envelope** — exact gelijk aan Contract (byte-compatibel via `System.Text.Json`, camelCase):
  ```json
  { "eventId":"<uuid>", "eventType":"monitoring.<aggregate>.<event>",
    "occurredAt":"<ISO-8601 UTC>", "producer":"monitoring", "version":1, "data":{ ... } }
  ```
  `occurredAt` = tijdstip van het domein-event (niet van de relay). Tijden ISO-8601 UTC,
  `ernst` als string `Laag|Middel|Hoog|Kritiek`.
- **`OutboxEventPublisher : IEventPublisher`** (Fase 2) — schrijft elk event **als envelope**
  naar `OutboxMessage` in **dezelfde EF-transactie** als de aggregate (geen dual-write).
- **`OutboxRelay`** (`BackgroundService`/`IHostedService`) — polt onverzonden rijen (FIFO,
  batch ~50, interval ~1s), `BasicPublish` naar `rws.events` met de opgeslagen routing key,
  markeert daarna verzonden. At-least-once; consumers zijn idempotent.
- **`BeheerKunstwerkConsumer`** (`IHostedService`) — eigen durable queue
  **`monitoring.beheer-kunstwerk`** gebonden op `beheer.kunstwerk.*`; per bericht: dedupe op
  `eventId` via `VerwerktEvent` (skip indien verwerkt), vertaal `geregistreerd` (upsert) /
  `buitengebruikgesteld` (markeer `InGebruik=false`) naar `BekendKunstwerk` (anti-corruption),
  markeer verwerkt, `ack`; bij fout `nack` zonder requeue.

### 5.3 Config & health

- `Config` uit env: `SERVICE_PORT` (default 8002), `DATABASE_URL` (verplicht), `RABBITMQ_URL`
  (verplicht), `KUNSTWERK_VALIDATIE` (`soepel`|`streng`, default `soepel`).
- **`GET /health`** → 200 `{status:"ok",db:true,broker:true}` / 503 `degraded`; checkt DB
  (`SELECT 1`) + broker-connectie.

## 6. Transactiegrenzen & consistentie

- **Eén aggregate per transactie** als regel. `RegistreerMeting` raakt sessie (teller + event),
  meting (persist) en evt. een nieuw `Incident`; voor dit schoolproject in één use case/transactie
  (zelfde pragmatiek als Contract's `GunAanbesteding`). De zuivere event-handler-variant
  (eventual consistency) blijft genoteerd als latere verbetering.
- **Transactionele outbox** (Fase 2): domein-events → `OutboxMessage` in de EF-transactie; de
  `OutboxRelay` publiceert asynchroon. Vervangt publish-na-persist.
- **Consumers idempotent** via `VerwerktEvent` (dedupe op `eventId`; RabbitMQ = at-least-once).

## 7. Interface (`Monitoring.Api`)

Minimal APIs onder `/api`, dunne handlers (valideer DTO → use case → map response):

| Methode + pad                                   | Use case / query               |
|-------------------------------------------------|--------------------------------|
| `POST /api/sessies`                              | `StartMonitoringSessie`        |
| `POST /api/sessies/{id}/pauzering`               | `PauzeerMonitoringSessie`      |
| `POST /api/sessies/{id}/hervatting`              | `HervatMonitoringSessie`       |
| `POST /api/sessies/{id}/afronding`               | `RondMonitoringSessieAf`       |
| `GET  /api/sessies` · `GET /api/sessies/{id}`    | `ZoekSessies` / `GetSessie`    |
| `POST /api/metingen`                             | `RegistreerMeting` (sensor-ingang) |
| `GET  /api/metingen?kunstwerkId=…&sensorType=…`  | `ZoekMetingen`                 |
| `POST /api/incidenten/{id}/inbehandelingname`    | `NeemIncidentInBehandeling`    |
| `POST /api/incidenten/{id}/oplossing`            | `LosIncidentOp`                |
| `GET  /api/incidenten?status=…&kunstwerkId=…` · `GET /api/incidenten/{id}` | `ZoekIncidenten` / `GetIncident` |
| `POST /api/rapporten`                            | `StelRapportOp`                |
| `GET  /api/rapporten?kunstwerkId=…` · `GET /api/rapporten/{id}` | `ZoekRapporten` / `GetRapport` |
| `POST /api/netwerkrapportages` (Fase 2)          | `StelNetwerkrapportageOp`      |
| `GET  /health`                                   | health-check (DB + broker)     |

- **OpenAPI** via `builder.Services.AddOpenApi()` + `app.MapOpenApi()`; **Scalar** UI op
  `/api/docs` (`app.MapScalarApiReference`). DomeinFout → HTTP 400/409, niet-gevonden → 404
  (centrale fout-mapping, zoals Contract's `naarHttpFout`).
- **Composition root = `Program.cs`**: config → `DbContext` → repos → publisher (outbox) →
  use cases → endpoints; registreer `BeheerKunstwerkConsumer` en `OutboxRelay` als hosted
  services; `app.Run()` op 8002. DI via de ingebouwde container.

## 8. Fase 2 — netwerkrapportage naar Beheer (nieuw event)

De context-map heeft Monitoring→Beheer (customer/supplier): een **netwerkrapportage** om de
(ontwerp)eisen te valideren. `docs/events.md` kent hiervoor nog geen routing key. Als eigenaar
van Monitoring definieer ik een **nieuw event** en voeg ik de rij toe aan `docs/events.md`:

- **Routing key:** `monitoring.netwerkrapportage.opgesteld`
- **`data`:** `{ periode: {start, eind}, opgesteldOp, kunstwerken: [{ kunstwerkId,
  aantalMetingen, aantalIncidenten, zwaarsteErnst }] }`
- **Trigger:** on-demand via `POST /api/netwerkrapportages` (net als het per-kunstwerk rapport).
- Beheer bindt hierop als customer; **hún consumer bouw ik niet** (andere context — gouden regel #1).

Het per-kunstwerk-rapport (`monitoring.rapport.opgesteld`, afgenomen door Contract voor KPI's)
houdt `incidentId` = zwaarste open incident (nullable) + `incidentIds` binnen `resultaten`
(conform openstaand punt §12 van het originele ontwerp).

## 9. Teststrategie (xUnit, TDD)

- **`Monitoring.UnitTests`** — value-object-invarianten (`SensorData`-eenheden/grenzen, ids),
  `MonitoringSessie`-statusmachine + meten-alleen-bij-Actief, `Incident`-statusmachine +
  vervolgactie-afleiding, `AnalyseService`-grensgevallen (f = 1, 1.25, 1.5, 2),
  `MonitoringRapport`-berekening; elke use case met in-memory fakes (`InMemory*Repository`,
  `FakeEventPublisher`, `FakeKunstwerkenReadModel`, `VasteIdGenerator`, `VasteKlok`) — assert
  eindtoestand **én** uitgestuurde events, met en zonder afwijking, soepel én streng.
- **`Monitoring.IntegrationTests`** (Fase 2) — **Testcontainers** (`Testcontainers.PostgreSql`
  + `Testcontainers.RabbitMq`): EF-migraties draaien, repo round-trips, outbox schrijft-en-
  levert-één-keer, consumer verwerkt `beheer.kunstwerk.*` idempotent, en een end-to-end
  `POST /api/metingen` (via `WebApplicationFactory`) → incident → envelope landt op `rws.events`.
- **TDD, commit per taak, op branch `monitoring-service`.**

## 10. Docker & lokaal draaien

- **`Dockerfile`** (multi-stage): `mcr.microsoft.com/dotnet/sdk:10.0` → `dotnet restore`/`publish`;
  runtime `mcr.microsoft.com/dotnet/aspnet:10.0`. Bij start: EF-migraties toepassen
  (`dotnet Monitoring.Api.dll` met migrate-op-startup, of `dotnet ef database update`), dan de
  host op 8002.
- **`.env`** afgeleid van `.env.example` (incl. `KUNSTWERK_VALIDATIE`).
- Het **`monitoring:`-blok** in `../docker-compose.yml` uncommenten (vindt `postgres`/`rabbitmq`
  op containernaam).
- Verificatie: `docker compose up --build` → `GET http://localhost:8002/health` = 200 en
  OpenAPI-UI op `/api/docs`.

## 11. Buiten scope (YAGNI)

Wide-column/DynamoDB-opslag; echte sensor-ACL-adapters (nu is `POST /api/metingen` de ingang);
configureerbare drempels per kunstwerk; handmatige afwijkingsbevestiging; periodieke/geplande
rapportage (scheduler); automatisch afronden van sessies bij `beheer.kunstwerk.buitengebruikgesteld`
(nu alleen read-model-markering); partial unique index op "één lopende sessie per kunstwerk";
Dokploy-deploy; authenticatie/autorisatie.

## 12. Openstaande punten

- **Netwerkrapportage-payload** is een voorstel; Beheer conformeert zich hieraan als customer.
  Rij wordt aan `docs/events.md` toegevoegd bij implementatie.
- **Drempelwaarden/eenheden per SensorType** blijven aannames (aanpasbaar zonder gevolgen).
- **Migrate-op-startup vs. init-container**: voor dit schoolproject migrate-op-startup in de
  container-CMD (zoals Contract `prisma migrate deploy`).
