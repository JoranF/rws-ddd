# Conventies

Afspraken die **iedereen** volgt, zodat vier losse services samen één systeem vormen.

## 1. Poorten

| Service    | Interne poort | Env-var        |
|------------|---------------|----------------|
| Contract   | 8001          | `SERVICE_PORT` |
| Monitoring | 8002          | `SERVICE_PORT` |
| Onderhoud  | 8003          | `SERVICE_PORT` |
| Beheer     | 8004          | `SERVICE_PORT` |

## 2. Health
Elke service exposeert **`GET /health`** dat `200 OK` teruggeeft zodra de service klaar
is. Docker (lokaal) en Dokploy (productie) gebruiken dit voor healthchecks.

## 3. REST
- Basispad: **`/api`** (bv. `GET /api/kunstwerken`, `POST /api/onderhoud`).
- Lokaal vinden services elkaar op containernaam: `http://beheer:8004/api/...`.
- Documenteer je endpoints (bij voorkeur OpenAPI/Swagger). Andere teams bouwen hierop.
- Gebruik REST voor **synchrone queries** ("geef kunstwerk X"), niet voor het doorgeven van
  gebeurtenissen — dat gaat via events.

## 4. Events
- Zie [events.md](events.md) voor het volledige contract.
- Kort: publiceer op de topic-exchange **`rws.events`** met routing key
  `<context>.<aggregate>.<event>` en de vaste JSON-envelope.
- Gebruik events voor **integratie** ("er is iets gebeurd"): losse koppeling tussen contexts.

## 5. Omgevingsvariabelen
Elke service leest minimaal:

| Var            | Voorbeeld                                            |
|----------------|------------------------------------------------------|
| `SERVICE_PORT` | `8004`                                               |
| `DATABASE_URL` | `postgres://rws:rws@postgres:5432/beheer_db`         |
| `RABBITMQ_URL` | `amqp://rws:rws@rabbitmq:5672`                       |

Zie `<service>/.env.example`. Commit nooit een echte `.env`.

## 6. Data — database per context
DDD-principe: elke bounded context bezit zijn eigen data. Lokaal draait één Postgres met
een database per context (`beheer_db`, `contract_db`, `monitoring_db`, `onderhoud_db`,
aangemaakt door `infra/postgres/init/`). **Nooit** de tabellen van een andere context
lezen of schrijven — vraag data op via REST of luister naar events.

> **Eigen stack per service.** Het skelet gebruikt bewust één gedeelde Postgres voor
> lokaal gemak, maar een context is vrij zijn eigen opslag te kiezen. Het verslag stelt
> per service voor: **Beheer** → MySQL (relationeel, kunstwerk-register) op **Python**,
> **Monitoring** → een wide-column DB (DynamoDB) voor sensordata. Kies je een andere DB,
> laat je service dan nog steeds op `SERVICE_PORT` draaien en integreren via REST/events;
> de gedeelde Postgres blijft beschikbaar voor wie hem gebruikt.

## 7. Interne laagindeling (DDD tactical)
Aanbevolen structuur binnen elke service (elke map heeft een eigen `CLAUDE.md`):

```
domain/          entities, value objects, aggregates, domain events, repo-interfaces
application/     use cases (commands/queries), orkestratie, transactiegrenzen
infrastructure/  repo-implementaties, DB, RabbitMQ, HTTP-clients, /health
interface/       REST-controllers, event-handlers, DTO's, validatie
```

**Afhankelijkheidsregel:** `interface → application → domain` en
`infrastructure → domain/application`. `domain` hangt van niets af. Afhankelijkheden
wijzen naar binnen. Je mag de mapnamen aanpassen aan je stack (bv. Java `src/main/...`),
maar bewaar de scheiding én de `CLAUDE.md`-guidance.

## 8. Checklist — je service toevoegen
1. `README.md` van je service invullen (eigenaar, ubiquitous language, endpoints, events).
2. Code opbouwen in de vier lagen; houd je aan de afhankelijkheidsregel.
3. `GET /health` implementeren op `SERVICE_PORT`.
4. Events publiceren/consumeren volgens [events.md](events.md); consumers idempotent.
5. `Dockerfile` schrijven (template staat klaar) — luistert op `SERVICE_PORT`.
6. `cp .env.example .env` en je servicblok in `../docker-compose.yml` uncommenten.
7. Lokaal testen met `docker compose up --build`.
8. Deployen volgens [dokploy.md](dokploy.md).
