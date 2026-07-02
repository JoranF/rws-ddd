# Contract

Bounded context: **onderhoudscontracten & aanbestedingen**. Regelt de afspraken tussen
Rijkswaterstaat (opdrachtgever) en externe aannemers (opdrachtnemers) voor het onderhoud
van kunstwerken: opstellen, aanbesteden (volgens EMVI) en beheren van contracten. Binnen
deze context wordt een kunstwerk in de eigen taal vaak **"object"** genoemd; het verwijst
naar een kunstwerk uit Beheer via `kunstwerkId`.

- **Poort:** 8001
- **Database:** `contract_db`
- **Eigenaar:** _TBD_

## Verantwoordelijkheden
- Onderhoudscontract opstellen zodra een object in gebruik is (met de asset manager).
- Aanbesteden: publiceren, inschrijvingen ontvangen, beoordelen via **EMVI** (prijs + kwaliteit) en gunnen.
- Contract beheren: wijzigingen (meer-/minderwerk), prestatieverklaringen, eindafrekening.
- Vragen beantwoorden als "welk contract dekt object X?".

## Ubiquitous language (uit het verslag)
Onderhoudscontract · Aanbesteding · Inschrijving · Opdrachtgever (RWS) ·
Opdrachtnemer/OpdrachtnemerReferentie (KvK + naam) · ContractStatus (Concept/Aanbesteed/
Gegund/Lopend/Afgerond) · Looptijd · Geld · Prestatieverklaring · EMVI / EmviScore ·
Gunningscriteria · Inlichtingen · `kunstwerkId` (referentie naar Beheer, lokaal "object").

## Integratie
- **Publiceert** (via een transactionele **outbox** → relay op `rws.events`):
  `contract.aanbesteding.gepubliceerd`, `contract.inschrijving.ontvangen`,
  `contract.aanbesteding.gegund`, `contract.onderhoudscontract.gegund`,
  `contract.wijziging.goedgekeurd`, `contract.prestatieverklaring.opgesteld`,
  `contract.onderhoudscontract.afgerond`.
- **Consumeert** (idempotent, dedupe op `eventId`):
  - `beheer.kunstwerk.*` → read-model van bekende kunstwerken; bij
    `buitengebruikgesteld` worden actieve contracten gesignaleerd.
  - `beheer.ontwerpeisen.vastgesteld` → ontwerpeisen-read-model.
  - `monitoring.rapport.opgesteld` (conformist/ACL) → KPI-read-model; voedt de
    prestatieverklaring.
- **REST:** onder `/api`, o.a. `GET /api/contracten`, `GET /api/contracten?kunstwerkId=...`,
  `POST /api/aanbestedingen`, `POST /api/aanbestedingen/:id/gunning`. OpenAPI op `/api/docs`.

## Stack
Node.js 22 + TypeScript (ESM) · Fastify 5 · Prisma 6 (PostgreSQL `contract_db`) ·
amqplib (RabbitMQ topic-exchange `rws.events`) · Vitest.

## Bouwen & testen
```bash
cp .env.example .env          # SERVICE_PORT/DATABASE_URL/RABBITMQ_URL/KUNSTWERK_VALIDATIE
npm install
npm test                      # unit-tests (domain + application + infrastructure)
npm run test:integration      # Testcontainers-integratietests (vereist Docker)
```
`KUNSTWERK_VALIDATIE`: `soepel` (Fase 1, waarschuwt) of `streng` (Fase 2, weigert gunnen op
onbekende/buitengebruikgestelde kunstwerken). Streng vereist dat het read-model gevuld is
door `beheer.kunstwerk.*`-events.

## Lokaal draaien
Het `contract`-blok staat actief in de root-`docker-compose.yml`:
```bash
docker compose up --build contract postgres rabbitmq
curl -s localhost:8001/health   # {"status":"ok","db":true,"broker":true}
```

## Deploy (Dokploy)
Eigen Dokploy **Application**, Build Path `/contract`, Build Type Dockerfile, poortdoel
`8001`, health check path `/health`, env-vars `SERVICE_PORT`/`DATABASE_URL`/`RABBITMQ_URL`/
`KUNSTWERK_VALIDATIE` (zie [docs/dokploy.md](../docs/dokploy.md)). De container draait bij
start `prisma migrate deploy`.

## Status
Fase 1 **af** (zelfstandig draaiend: eigen events + REST + `/health` + Dockerfile +
compose-blok). Fase 2 **af** (consumers voor ontwerpeisen/KPI, signalering bij
buitengebruikstelling, strenge validatie, transactionele outbox, Testcontainers-tests).
