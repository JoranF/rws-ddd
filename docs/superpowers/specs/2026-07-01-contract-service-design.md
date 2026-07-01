# Ontwerp — Contract-service (bounded context Contract)

_Datum: 2026-07-01 · Status: vastgesteld (ontwerp, vóór implementatie) · Eigenaar: Joran_

> Leidend blijven de repo-docs: `/CLAUDE.md`, `/contract/CLAUDE.md`, `/docs/conventions.md`,
> `/docs/context-map.md`, `/docs/events.md`. Dit document legt het **implementatie-ontwerp**
> van de Contract-service vast. Bij tegenstrijdigheid over het domein winnen die docs
> (en het onderliggende DDD-verslag).

## 1. Doel & scope

De Contract-context beheert de **aanbestedings- en contractlevenscyclus** voor onderhoud
aan RWS-kunstwerken: een aanbesteding (EMVI) publiceren, inschrijvingen ontvangen, gunnen,
en het resulterende onderhoudscontract beheren (wijzigingen, prestatieverklaringen,
afronden). De context verwijst naar kunstwerken via **`kunstwerkId`** (bron van waarheid =
Beheer) en kopieert geen beheer-model.

**Vaste kaders (uit conventions):** poort **8001** (`SERVICE_PORT`), DB **`contract_db`**
(`DATABASE_URL`), broker `rws.events` (`RABBITMQ_URL`), `GET /health` verplicht, REST onder
`/api`, events volgen de vaste envelope.

### Technische keuzes (vastgesteld tijdens brainstorm)

| Onderwerp     | Keuze                                                              |
|---------------|-------------------------------------------------------------------|
| Taal          | Node.js + TypeScript                                              |
| Framework     | Fastify + handmatige laagindeling (geen opinionated framework)    |
| Persistentie  | Prisma (schema-first, migraties); modellen alleen in `infrastructure` |
| Domeinmodel   | Rijk: twee aggregates met invarianten en value objects           |
| Beheer-integratie | Consumer + lokaal read-model; validatie configureerbaar (soepel in Fase 1) |
| Testen        | TDD op `domain` + `application` met Vitest en in-memory fakes     |
| Bouwvolgorde  | Walking skeleton eerst, daarna domein verrijken (aanpak A)        |

## 2. Fasering

De bouw is gefaseerd omdat de consumerende integratie afhangt van andere teams (vooral
Beheer en Monitoring).

**Fase 1 — nu.** Alles wat Contract **zelf produceert**, als zelfstandig draaiende service:
walking skeleton, beide aggregates volledig, alle 7 gepubliceerde events, REST + OpenAPI,
de Beheer-`kunstwerk.*`-consumer met read-model (idempotent), Docker/compose. De
kunstwerk-validatie staat **soepel** (configureerbaar), zodat de service draait vóórdat
Beheer events publiceert.

**Fase 2 — later (als Beheer/Monitoring draaien).** Alles wat Contract **consumeert/afstemt**:
consumeer `beheer.ontwerpeisen.vastgesteld` en `monitoring.rapport.opgesteld` (conformist:
KPI-data voor prestatieverklaringen), zet de kunstwerk-validatie op **streng**, reageer op
`beheer.kunstwerk.buitengebruikgesteld` t.o.v. actieve contracten, en voeg
integratietests (Testcontainers) + deploy (Dokploy) toe.

## 3. Architectuur & mapindeling

Vier lagen met de afhankelijkheidsregel naar binnen (`interface → application → domain`,
`infrastructure → domain/application`; `domain` hangt van niets af).

```
contract/
  domain/          aggregates, value objects, domain events, repo- & port-interfaces
  application/     use cases (commands/queries), DTO-mapping
  infrastructure/  Prisma-repos, RabbitMQ publisher/consumer, config, health, composition root
  interface/       Fastify-routes (/api), request/response-DTO's + validatie, OpenAPI, /health-route
  prisma/          schema.prisma + migraties
  test/            Vitest unit tests (domain + application) + in-memory fakes
  package.json, tsconfig.json, vitest.config.ts, Dockerfile, .env(.example)
```

**Kernprincipe:** `domain` is puur TypeScript — geen Prisma, geen Fastify, geen amqplib.
Inkomende events/DB-rijen worden aan de rand (`infrastructure`) vertaald naar domeintaal
(anti-corruption). De **composition root** (`infrastructure/main.ts`, compileert naar
`dist/main.js`) bedraadt handmatig: config → Prisma-client → repos → publisher → use cases
→ Fastify-routes → consumer.

## 4. Domeinmodel

Twee aggregates in de Contract-context.

### 4.1 Aggregate `Aanbesteding` (EMVI-aanbesteding)

- **Root `Aanbesteding`:** `AanbestedingId`, `kunstwerkId: KunstwerkId`, `sluitingsdatum`,
  `gunningscriteria: Gunningscriteria`, `status` (`Gepubliceerd` → `Gegund`).
- **Entity `Inschrijving`** (binnen het aggregate): `aannemer: Aannemer`, `prijs: Bedrag`,
  `kwaliteitsscore` (0–100).
- **Invarianten:**
  - Inschrijven mag alleen bij status `Gepubliceerd`.
  - Gunnen vereist ≥ 1 inschrijving; kiest de hoogste **EMVI-score**.
  - Een aanbesteding is maar één keer gunbaar (daarna `Gegund`).
  - `sluitingsdatum` ligt in de toekomst bij publiceren (validatie aan de rand mag dit
    versoepelen voor test-/seed-data).
- **EMVI-score** (domain-berekening): genormaliseerde prijs-score × prijsgewicht +
  kwaliteitsscore × kwaliteitsgewicht. Prijs-score = laagste prijs / eigen prijs (lager is
  beter → hoogste score voor laagste prijs). Gewichten komen uit `Gunningscriteria`.
- **Domain events:** `AanbestedingGepubliceerd`, `InschrijvingOntvangen`, `AanbestedingGegund`.

### 4.2 Aggregate `Onderhoudscontract`

Ontstaat uit een gunning (los aggregate; zie §6 voor de transactiegrens).

- **Root `Onderhoudscontract`:** `ContractId`, `kunstwerkId: KunstwerkId`,
  `opdrachtnemer: Aannemer`, `looptijd: Contractperiode`, `waarde: Bedrag`,
  `aanbestedingId?` (herkomst), `status` (`Actief` → `Afgerond`).
- **Entity `Wijziging`:** `bedrag: Bedrag` (mutatie, mag negatief), `reden`, `datum`.
- **Entity `Prestatieverklaring`:** `periode: Contractperiode`, `score` (0–100), `bedrag: Bedrag`.
- **Invarianten:**
  - Wijziging en prestatieverklaring alleen op status `Actief`.
  - `Prestatieverklaring.periode` valt binnen `looptijd`.
  - Afronden alleen als `Actief`; daarna geen mutaties meer.
  - `waarde` na een wijziging nooit < 0.
- **Domain events:** `OnderhoudscontractGegund`, `WijzigingGoedgekeurd`,
  `PrestatieverklaringOpgesteld`, `OnderhoudscontractAfgerond`.

### 4.3 Gedeelde value objects

`KunstwerkId` (referentie naar Beheer), `Bedrag` (bedrag + valuta `EUR`, ≥ 0),
`Contractperiode` (start/eind; invariant eind > start), `Gunningscriteria`
(prijsgewicht + kwaliteitsgewicht, samen 100 %), `EMVIScore`, `Aannemer`/`Opdrachtnemer`
(naam + optioneel identificatie).

## 5. Use cases (application) & ports

**Commands** (elk = één transactie, publiceert na commit zijn domain event(s)):

| Use case                     | Aggregate          | Publiceert                                            |
|------------------------------|--------------------|-------------------------------------------------------|
| `PubliceerAanbesteding`      | Aanbesteding       | `contract.aanbesteding.gepubliceerd`                  |
| `OntvangInschrijving`        | Aanbesteding       | `contract.inschrijving.ontvangen`                     |
| `GunAanbesteding`            | Aanbesteding (+ maakt Onderhoudscontract) | `contract.aanbesteding.gegund` **en** `contract.onderhoudscontract.gegund` |
| `KeurWijzigingGoed`          | Onderhoudscontract | `contract.wijziging.goedgekeurd`                      |
| `StelPrestatieverklaringOp`  | Onderhoudscontract | `contract.prestatieverklaring.opgesteld`              |
| `RondOnderhoudscontractAf`   | Onderhoudscontract | `contract.onderhoudscontract.afgerond`                |

**Queries:** `ZoekAanbestedingen`, `GetAanbesteding(id)`, `ZoekContracten`,
`ZoekContractenPerKunstwerk(kunstwerkId)`, `GetContract(id)`.

**Ports (interfaces in `domain`/`application`, geïmplementeerd in `infrastructure`):**
`AanbestedingRepository`, `OnderhoudscontractRepository`, `EventPublisher`,
`KunstwerkenReadModel` (query `bestaatEnInGebruik(kunstwerkId)`).

`GunAanbesteding` gebruikt `KunstwerkenReadModel` om te controleren of het kunstwerk bekend
en in gebruik is. In Fase 1 is dit **soepel**: onbekend kunstwerk → waarschuwing/log, geen
blokkade (vlag `KUNSTWERK_VALIDATIE=soepel`). In Fase 2 → `streng` (afwijzen).

## 6. Transactiegrenzen & consistentie

- **Eén aggregate per transactie** als regel. `GunAanbesteding` raakt twee aggregates
  (Aanbesteding gunnen + Onderhoudscontract aanmaken). Voor dit schoolproject doen we dit
  in één use case/transactie voor eenvoud, met de kanttekening dat de zuivere DDD-variant
  een event-handler op `AanbestedingGegund` zou zijn (eventual consistency). Genoteerd als
  mogelijke Fase 2-verbetering.
- **Events publiceren ná succesvolle persist.** Bij falen ná commit maar vóór publish is er
  risico op een gemist event (at-least-once elders). Een **transactionele outbox** is de
  nette oplossing en staat genoteerd als latere verbetering; niet in Fase 1.
- **Consumers idempotent** via `verwerkt_event` (dedupe op `eventId`).

## 7. Infrastructure

- **Prisma-schema** (`contract/prisma/schema.prisma`) met tabellen: `aanbesteding`,
  `inschrijving`, `onderhoudscontract`, `wijziging`, `prestatieverklaring`, read-model
  `bekend_kunstwerk`, en `verwerkt_event` (idempotentie). Migraties via `prisma migrate`.
- **Repo-implementaties** `PrismaAanbestedingRepository`, `PrismaOnderhoudscontractRepository`
  — mappen rijen ↔ aggregate; Prisma-typen blijven in deze laag.
- **`RabbitMqEventPublisher`** — implementeert `EventPublisher`; verpakt elk domain event in
  de envelope (`eventId` = uuid, `eventType` = routing key, `occurredAt` = ISO-8601 UTC,
  `producer` = `"contract"`, `version` = 1, `data`) en publiceert op de durable topic-exchange
  `rws.events` met routing key `contract.<aggregate>.<event>`.
- **`BeheerKunstwerkConsumer`** — eigen durable queue gebonden op `beheer.kunstwerk.*`;
  idempotent via `verwerkt_event`; vertaalt `geregistreerd` (upsert) en `buitengebruikgesteld`
  (markeer) naar het `bekend_kunstwerk`-read-model (anti-corruption).
- **Config** (`SERVICE_PORT`, `DATABASE_URL`, `RABBITMQ_URL`, `KUNSTWERK_VALIDATIE`),
  logging (pino via Fastify), en de concrete **`/health`** (checkt DB- en broker-connectie).

## 8. Interface (REST + OpenAPI)

Fastify, alle paden onder `/api`; validatie via Fastify JSON-schema; OpenAPI via
`@fastify/swagger` + `@fastify/swagger-ui`.

| Methode + pad                                   | Use case / query               |
|-------------------------------------------------|--------------------------------|
| `POST /api/aanbestedingen`                       | `PubliceerAanbesteding`        |
| `POST /api/aanbestedingen/:id/inschrijvingen`    | `OntvangInschrijving`          |
| `POST /api/aanbestedingen/:id/gunning`           | `GunAanbesteding`              |
| `GET  /api/aanbestedingen`                        | `ZoekAanbestedingen`           |
| `GET  /api/aanbestedingen/:id`                    | `GetAanbesteding`              |
| `POST /api/contracten/:id/wijzigingen`           | `KeurWijzigingGoed`            |
| `POST /api/contracten/:id/prestatieverklaringen` | `StelPrestatieverklaringOp`    |
| `POST /api/contracten/:id/afronding`             | `RondOnderhoudscontractAf`     |
| `GET  /api/contracten`                            | `ZoekContracten`               |
| `GET  /api/contracten?kunstwerkId=…`              | `ZoekContractenPerKunstwerk`   |
| `GET  /api/contracten/:id`                        | `GetContract`                  |
| `GET  /health`                                    | health-check (DB + broker)     |

Controllers zijn dun: ontvang → valideer → roep use case → map naar response. Geen
domeinregels in de interface-laag.

## 9. Teststrategie (Vitest, TDD)

- **domain:** value objects (`Bedrag`, `Contractperiode`, `Gunningscriteria`),
  EMVI-berekening + gunning-invarianten (`Aanbesteding`), en `Onderhoudscontract`-invarianten
  (wijziging/prestatieverklaring/afronden, periode binnen looptijd, waarde ≥ 0).
- **application:** elke use case met in-memory fakes (`InMemoryAanbestedingRepository`,
  `InMemoryOnderhoudscontractRepository`, `FakeEventPublisher`, `InMemoryKunstwerkenReadModel`);
  assert eindtoestand én de uitgestuurde events.
- **licht (infrastructure):** envelope-mapping van de publisher (met fake channel) en
  idempotentie van de consumer (dedupe op `eventId`).
- **Buiten Fase 1:** DB-integratietests (Testcontainers) en API/e2e-tests — Fase 2.

## 10. Docker & lokaal draaien

- **Dockerfile** (Node, multi-stage): TypeScript builden → productie-image; bij start
  `prisma migrate deploy` en daarna de service op `SERVICE_PORT` (8001).
- **`.env`** afleiden van `.env.example` (voeg `KUNSTWERK_VALIDATIE=soepel` toe).
- Het `contract`-blok in `../docker-compose.yml` **uncommenten**; de service vindt
  `postgres` en `rabbitmq` op containernaam.
- Verificatie: `docker compose up --build`, dan `GET http://localhost:8001/health` → 200 en
  de OpenAPI-UI zichtbaar.

## 11. Buiten scope (Fase 1 / YAGNI)

- Transactionele outbox (nu: publish-na-commit).
- Consumeren van `beheer.ontwerpeisen.vastgesteld` en `monitoring.rapport.opgesteld`
  (Fase 2; conformist op Monitoring).
- Strenge kunstwerk-validatie en reactie op buitengebruikstelling (Fase 2).
- Aannemer/Opdrachtnemer als eigen aggregate (nu VO binnen de contracten).
- DB-integratietests, e2e-tests, Dokploy-deploy (Fase 2).
- Authenticatie/autorisatie (niet in de opdracht).

## 12. Openstaande punten

- **EMVI-formule:** exacte normalisatie van de prijs-score bevestigen (voorstel: laagste
  prijs / eigen prijs). Aanpasbaar zonder gevolgen voor de rest van het ontwerp.
- **Statusmodel Aanbesteding:** eventueel een expliciete `Gesloten`-status na sluitingsdatum
  vóór gunning — nu impliciet (gunnen kan zolang `Gepubliceerd`).
```

