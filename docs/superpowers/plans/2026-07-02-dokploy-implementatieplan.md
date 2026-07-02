# Dokploy-implementatieplan — RWS-DDD naar productie

_Datum: 2026-07-02 · Status: alle vier services staan af op `main`, lokale stack volledig
geverifieerd (21/21 end-to-end checks, alle pijlen uit `docs/context-map.md`, consumers op
`streng`). Dit plan zet die stack stap voor stap op Dokploy, volgens het hybride model uit
[docs/dokploy.md](../../dokploy.md): één gedeelde infra, één Application per bounded context._

## 0. Uitgangssituatie (geverifieerd)

| Service    | Stack                          | Poort | Dockerfile | Migraties bij start          | Extra env naast de standaard                    |
|------------|--------------------------------|-------|------------|------------------------------|-------------------------------------------------|
| Contract   | Node 22 / Fastify 5 / Prisma 6 | 8001  | ✅         | `prisma migrate deploy`      | `KUNSTWERK_VALIDATIE=streng`                    |
| Monitoring | .NET 10 / EF Core / RabbitMQ.Client | 8002 | ✅    | `Database.MigrateAsync()`    | `KUNSTWERK_VALIDATIE=streng`                    |
| Onderhoud  | Node 22 / NestJS 11 / TypeORM  | 8003  | ✅         | `migrationsRun: true`        | `VALIDATIE=streng`                              |
| Beheer     | Python 3.12 / FastAPI / SQLAlchemy | 8004 | ✅      | `alembic upgrade head` (CMD) | `ENABLE_RABBITMQ_CONSUMERS=true`                |

Standaard-env per service (zie `docs/conventions.md` §5): `SERVICE_PORT`, `DATABASE_URL`,
`RABBITMQ_URL`. Elke service heeft `GET /health` (checkt db + broker, 200/503) en integreert
uitsluitend via de topic-exchange `rws.events` (envelope: `docs/events.md`).

Daarnaast komt er een **frontend-demo-dashboard** in `frontend/` (nginx + statische build,
lokaal poort 8005, genereren via [docs/frontend-demo-prompt.md](../../frontend-demo-prompt.md));
deployen als vijfde Application onder `demo.<domein>` — zie §3b.

## 1. Eenmalige voorbereiding (door één teamlid)

1. **Server**: VPS met Docker; installeer Dokploy (`curl -sSL https://dokploy.com/install.sh | sh`).
   Open poorten 80/443 (Traefik) en 3000 (Dokploy-UI, daarna achter eigen domein zetten).
2. **DNS**: wildcard of vijf subdomeinen naar de VPS:
   `contract.<domein>`, `monitoring.<domein>`, `onderhoud.<domein>`, `beheer.<domein>`
   en `demo.<domein>` (het frontend-dashboard, zie §3b).
3. **GitHub koppelen**: Dokploy → Settings → Git → koppel `JoranF/rws-ddd` (GitHub App of
   deploy key), branch `main`.
4. Maak het Dokploy **Project "RWS-DDD"**.

## 2. Gedeelde infra in het project

### 2.1 Postgres (Dokploy database-resource)
1. Project → Create → **Database → PostgreSQL 16**. Kies een **sterk wachtwoord**
   (niet `rws/rws` — dat is alleen lokaal).
2. Maak de vier context-databases aan (zelfde SQL als `infra/postgres/init/01-create-databases.sql`).
   Eén keer via de Dokploy-console van de Postgres-resource:
   ```sql
   CREATE DATABASE beheer_db;  CREATE DATABASE contract_db;
   CREATE DATABASE monitoring_db;  CREATE DATABASE onderhoud_db;
   ```
3. Noteer de **interne hostnaam** van de resource (Dokploy toont die; services bereiken
   hem via het `dokploy-network`). Géén publieke poort openzetten.

### 2.2 RabbitMQ (Compose-service)
RabbitMQ zit niet in Dokploy's database-lijst → Project → Create → **Compose** met:
```yaml
services:
  rabbitmq:
    image: rabbitmq:3-management
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_USER}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASS}
    volumes:
      - rabbitmq-data:/var/lib/rabbitmq
    networks: [dokploy-network]
volumes:
  rabbitmq-data:
networks:
  dokploy-network:
    external: true
```
Management-UI (15672) alleen via een Dokploy-domein met auth ontsluiten, of dichtlaten.
Noteer de interne hostnaam (bv. `rabbitmq`).

## 3. Per service een Application (door de eigenaar)

Voor **elk** van de vier (volgorde maakt niet uit — consumers zijn idempotent en de
services starten zelfstandig; zie stap 4 voor de functionele volgorde):

1. Project → Create → **Application**, koppel de Git-repo, branch `main`.
2. **Build Path / Base Directory** = `/contract`, `/monitoring`, `/onderhoud` resp. `/beheer`.
   **Build Type = Dockerfile** (elke service heeft er een).
3. **Watch paths** op de eigen map zetten (bv. `contract/**`) zodat een push alleen de
   eigen service herdeployt — dit is het hele punt van de monorepo-opzet.
4. **Environment variables** (vervang host/wachtwoorden door de waarden uit stap 2):
   ```
   SERVICE_PORT=<8001|8002|8003|8004>
   DATABASE_URL=postgres://<user>:<pass>@<postgres-host>:5432/<context>_db
   RABBITMQ_URL=amqp://<user>:<pass>@<rabbitmq-host>:5672
   ```
   Let op de afwijkingen: **beheer** gebruikt scheme `postgresql+psycopg://` en heeft
   `ENABLE_RABBITMQ_CONSUMERS=true` nodig; **contract/monitoring**:
   `KUNSTWERK_VALIDATIE=streng`; **onderhoud**: `VALIDATIE=streng`
   (Fase 2 — read-models worden door de events gevuld, streng is geverifieerd werkend).
5. **Domain** koppelen (`<service>.<domein>`), poortdoel = `SERVICE_PORT`, HTTPS aan
   (Traefik/Let's Encrypt automatisch).
6. **Health check path = `/health`** (bestaat en checkt db+broker in alle vier).
7. **Deploy** en controleer de logs: elke service draait zijn migraties bij start; bij
   beheer zie je `alembic upgrade head`, bij contract `prisma migrate deploy`, enz.

## 3b. Frontend (demo-dashboard) als vijfde Application

De frontend leeft in `frontend/` in dezelfde monorepo (genereren via
[docs/frontend-demo-prompt.md](../../frontend-demo-prompt.md); geen bounded context,
alleen presentatie). Nginx serveert de statische build én proxyt `/beheer/...`,
`/contract/...`, `/monitoring/...`, `/onderhoud/...` naar de interne servicenamen —
daardoor is CORS nergens nodig en werkt hetzelfde pad lokaal en op Dokploy.

1. Project → Create → **Application**, repo `JoranF/rws-ddd`, branch `main`,
   **Build Path = `/frontend`**, Build Type = Dockerfile, watch paths `frontend/**`.
2. **Environment variables** — wijs naar de interne hostnamen van de vier
   service-Applications op het `dokploy-network` (Dokploy toont die per app):
   ```
   CONTRACT_URL=http://<interne-host-contract>:8001
   MONITORING_URL=http://<interne-host-monitoring>:8002
   ONDERHOUD_URL=http://<interne-host-onderhoud>:8003
   BEHEER_URL=http://<interne-host-beheer>:8004
   ```
3. **Domain** = `demo.<domein>`, poortdoel **80** (nginx), HTTPS aan.
4. **Health check path = `/health`** (nginx geeft daar zelf 200 op).
5. Deploy; het dashboard op `https://demo.<domein>` stuurt nu alle services aan.
   De vier service-domeinen blijven daarnaast gewoon bruikbaar voor directe API-calls
   (OpenAPI-docs, curl-demo's).

## 4. Verificatie na deploy (zelfde checks als lokaal)

1. `curl https://<service>.<domein>/health` → 4× `200` met db+broker ok, plus
   `https://demo.<domein>/health` → `200` en het dashboard laadt met 4 groene badges.
2. RabbitMQ management → exchange `rws.events` bestaat; 9 durable queues met elk 1 consumer:
   `contract.beheer-kunstwerk`, `contract.beheer-ontwerpeisen`, `contract.monitoring-rapport`,
   `monitoring.beheer-kunstwerk`, `onderhoud.beheer`, `onderhoud.contract`,
   `onderhoud.monitoring-incident`, `beheer.monitoring_rapport_opgesteld`, `beheer.onderhoud_afgerond`.
3. Draai de event-doorstroomtest (de pijlen uit de context-map, volgorde is belangrijk
   omdat álle consumers op streng staan):
   1. Beheer: kunstwerk + onderhouds-/ontwerpeisen registreren (`POST /api/kunstwerken`, …).
   2. Monitoring: sessie starten → meting boven drempel (`Trilling` ≥ 5) → incident.
   3. Onderhoud: traject verschijnt automatisch (`GET /api/onderhoud`).
   4. Contract: aanbesteding → inschrijving → gunning (slaagt alleen als het
      kunstwerk-read-model gevuld is = bewijs van de beheer-events).
   5. Monitoring: rapport + netwerkrapportage → Beheer beoordeelt
      (`GET /api/rapportage-beoordelingen`), Contract stelt prestatieverklaring op
      **zonder** score (KPI komt uit het rapport).
   6. Onderhoud: start → inspectie → afronden → Beheer beoordeelt het onderhoudsrapport.
   7. Negatief: gunnen op een onbekend `kunstwerkId` moet geweigerd worden.

## 5. Doorlopende werkwijze

- **Deployen** = push naar `main` (of Deploy-knop); door de watch paths deployt alleen de
  gewijzigde service — teamleden zitten elkaar niet in de weg.
- **Rollback**: Dokploy houdt image-history per Application bij; kies een vorige deploy.
- **Secrets** alleen in Dokploy-env, nooit in de repo (lokaal blijft `.env.example` → `.env`).
- **Logs/monitoring**: Dokploy-logs per Application; RabbitMQ-UI voor queue-diepte
  (groeiende queue = consumer stuk).

## 6. Bekende aandachtspunten (voor deploy of vlak erna)

1. **Geen dead-letter exchange**: alle consumers doen `nack(requeue=false)` — een event dat
   faalt is definitief weg. Voor het schoolproject acceptabel; wil je het netjes, geef elke
   queue een DLX-argument en één `rws.events.dlq`.
2. **Beheer publiceert zonder outbox** (publish-na-commit) en **onderhoud publiceert direct**;
   contract en monitoring hebben wél een transactionele outbox. Bij een broker-storing kan
   beheer/onderhoud dus een event verliezen — bewuste Fase-2-afweging, documenteer het.
3. **Contract broker-healthcheck** meldt altijd `true` na start (geen reconnect-detectie);
   een RabbitMQ-herstart vereist een redeploy/herstart van contract en onderhoud.
4. **NU1903**: `Microsoft.OpenApi 2.0.0` (monitoring) heeft een bekende kwetsbaarheid —
   bump naar een gepatchte versie bij de volgende monitoring-wijziging.
5. **`monitoring.netwerkrapportage.opgesteld`** wordt gepubliceerd maar nog door niemand
   geconsumeerd; het beheer-Fase-2-plan
   ([2026-07-02-beheer-service-fase-2.md](2026-07-02-beheer-service-fase-2.md)) voorziet de
   binding. De per-kunstwerk-beoordeling loopt al via `monitoring.rapport.opgesteld`.
6. **`onderhoud.contractaanvraag.ingediend`** heeft nog geen consumer (Contract is de
   logische afnemer) en **`monitoring.incident.opgelost`** evenmin — bekende, bewuste gaten.
7. **Eigenaren** in de service-README's staan nog op `_TBD_` (conventions-checklist punt 1).
