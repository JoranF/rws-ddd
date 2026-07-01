# Vervolgstappen — Fase 2: integratie

_Datum: 2026-07-01 · Voor het hele team (elke service-eigenaar + de integratie-coördinatie)._

Dit document beschrijft **wat er na Fase 1 moet gebeuren** om van vier losse services één
werkend systeem te maken. Lees dit naast `docs/context-map.md` (relaties) en
`docs/events.md` (het event-contract).

## Waar staan we

- **Fase 1 (per service, grotendeels los):** elke context draait zelfstandig, produceert
  zijn **eigen** events + REST, en heeft een `/health`. Consumers bestaan al maar valideren
  **soepel** (onbekende referentie-ID's → waarschuwing, geen blokkade), zodat een service
  werkt vóórdat de upstream-services live zijn.
- **Fase 2 (samen):** we zetten alles tegelijk aan, verifiëren dat de events écht tussen de
  contexts stromen, zetten de validatie op **streng**, en werken de uitgestelde
  cross-context flows af. Dit is een **gezamenlijke milestone**: pas starten als iedere
  service Fase 1 af heeft.

## Stack per service (afgesproken)

Services zijn **stack-agnostisch** (gouden regel: integreren mag alleen via REST/events,
nooit via gedeelde code of DB). Om dat principe ook echt te laten zien, kiezen we bewust
**verschillende** stacks:

| Service    | Poort | Stack                                                        | Status        |
|------------|-------|--------------------------------------------------------------|---------------|
| Beheer     | 8004  | **Python + FastAPI + SQLAlchemy + Alembic + Pytest**         | geïmplementeerd |
| Contract   | 8001  | **Node.js + TypeScript + Fastify + Prisma + Vitest**         | plan af        |
| Onderhoud  | 8003  | **Node.js + TypeScript + NestJS + TypeORM** (i.p.v. Fastify/Prisma) | plan aanpassen |
| Monitoring | 8002  | **C# / .NET (ASP.NET Core) + EF Core + MassTransit**         | plan opnieuw genereren |

> De poorten, DB-namen, de vaste event-envelope en `/health` blijven **identiek** ongeacht
> de stack (zie `docs/conventions.md`). Alleen de interne technologie verschilt.

**Actie op de plannen (nog te doen door de service-eigenaar):**
- **Onderhoud** — `docs/superpowers/plans/2026-07-01-onderhoud-service-fase-1.md`: dezelfde
  lagen en use-cases, maar Fastify → **NestJS** en Prisma → **TypeORM**. De taken moeten in
  deze tools herschreven worden.
- **Monitoring** — `docs/superpowers/plans/2026-07-01-monitoring-service-fase-1.md`: dit is
  een andere taal; het plan wordt **opnieuw gegenereerd** voor .NET (EF Core-migraties,
  MassTransit of `RabbitMQ.Client` voor de topic-exchange, xUnit voor tests). De bestaande
  TypeScript-taken gelden dan als domein-/gedragsreferentie, niet als uit te voeren code.

## Fase 2 — gezamenlijke integratie-milestone (in volgorde)

1. **Iedere service rondt Fase 1 af.** Doorloop de checklist in `docs/conventions.md §8`:
   lagen, `/health`, eigen events publiceren, `Dockerfile`, `.env`, en het eigen blok in
   `docker-compose.yml` geactiveerd.
2. **Alles samen omhoog.** `docker compose up --build` met **alle vier** services + de
   gedeelde `rabbitmq` en `postgres`. Alle `/health` geven `200`.
3. **Event-doorstroom verifiëren.** Bind tijdelijk een test-queue op `rws.events` met key
   `#` (of per context, bv. `contract.#`) en voer per relatie uit `docs/context-map.md` één
   handeling uit; controleer dat het event bij de consumer aankomt en het read-model/gedrag
   klopt. Doe dit voor élke pijl in de context-map (zie de matrix hieronder).
4. **Read-models vullen + validatie op streng.** Zodra de upstream-events echt binnenkomen,
   zet elke consumer zijn validatievlag van `soepel` → **`streng`** (`KUNSTWERK_VALIDATIE` /
   `VALIDATIE`): referenties naar onbekende/buitengebruikgestelde ID's worden dan geweigerd.
5. **Uitgestelde cross-context flows aanzetten** (per service, zie de lijst hieronder).
6. **Integratietests + deploy.** Voeg cross-service smoke-/integratietests toe (bv.
   Testcontainers per service) en deploy elke service als eigen Dokploy-app op de gedeelde
   RabbitMQ/Postgres (`docs/dokploy.md`).

### Wie luistert naar wie (verifieer in stap 3)

| Upstream (producer) | Event(s)                                             | Downstream (consumer)      |
|---------------------|------------------------------------------------------|----------------------------|
| Beheer              | `beheer.kunstwerk.*`                                 | Contract, Monitoring, Onderhoud |
| Beheer              | `beheer.onderhoudseisen.vastgesteld`                 | Onderhoud                  |
| Beheer              | `beheer.ontwerpeisen.vastgesteld`                    | Contract                   |
| Contract            | `contract.onderhoudscontract.gegund` / `.afgerond`   | Onderhoud                  |
| Monitoring          | `monitoring.incident.aangemaakt`                     | Onderhoud                  |
| Monitoring          | `monitoring.rapport.opgesteld`                       | Contract (conformist: KPI's) |
| Monitoring          | netwerkrapportage                                    | Beheer (customer)          |
| Onderhoud           | `onderhoud.onderhoud.afgerond` (onderhoudsrapport)   | Beheer (partnership)       |

## Per-service Fase 2-taken (uitgesteld uit Fase 1)

**Beheer**
- Consumeer de **netwerkrapportage** van Monitoring (customer) om de (ontwerp)eisen te
  valideren; verwerk het **onderhoudsrapport** uit `onderhoud.onderhoud.afgerond`
  (partnership) terug in het kunstwerk-register.

**Contract**
- Consumeer `beheer.ontwerpeisen.vastgesteld` en `monitoring.rapport.opgesteld` (conformist:
  KPI-data voedt de **prestatieverklaring**).
- Reageer op `beheer.kunstwerk.buitengebruikgesteld` t.o.v. **actieve contracten** (signaleren).
- `KUNSTWERK_VALIDATIE` → `streng`. Transactionele **outbox** i.p.v. publish-na-commit.
- Testcontainers-integratietests + Dokploy-deploy.

**Onderhoud**
- Consumeer `monitoring.incident.aangemaakt`, `contract.onderhoudscontract.gegund`/`.afgerond`,
  `beheer.kunstwerk.*` en `beheer.onderhoudseisen.vastgesteld` (idempotent, dedupe op `eventId`).
- **Anti-Corruption Layer** voor externe aannemersfacturen/-inspecties.
- `VALIDATIE` → `streng`. Integratietests + Dokploy-deploy.
- (Plus: plan/code omzetten naar NestJS + TypeORM — zie stacktabel.)

**Monitoring**
- Consumeer `beheer.kunstwerk.*`; publiceer `monitoring.rapport.opgesteld` (afgenomen door
  Contract) en de netwerkrapportage naar Beheer.
- `KUNSTWERK_VALIDATIE` → `streng`. Integratietests + Dokploy-deploy.
- (Plus: plan/code (her)genereren in C# / .NET — zie stacktabel.)

## Coördinatie & Definition of Done

- **Eigenaarschap:** elke service-eigenaar doet de Fase 2-taken van zijn **eigen** context
  (gouden regel #1). Wijzig geen andermans code/DB; integreer via REST/events.
- **Gezamenlijk moment:** stap 2–3 (alles omhoog + event-doorstroom) doen we samen, zodat
  we live zien dat de contexts koppelen.
- **Klaar wanneer:** alle vier services draaien in één `docker compose up`, elke pijl uit de
  context-map is end-to-end geverifieerd, alle consumers staan op `streng`, en elke service
  is als eigen Dokploy-app gedeployed.

## Verwijzingen
- Relaties tussen contexts: `docs/context-map.md`
- Event-contract (envelope, routing keys, catalogus): `docs/events.md`
- Conventies (poorten, REST, env, lagen, checklist): `docs/conventions.md`
- Deployen: `docs/dokploy.md`
- Per-service plannen: `docs/superpowers/plans/` en `docs/superpowers/specs/`
