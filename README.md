# RWS-DDD — Rijkswaterstaat Infrastructuurbeheer

Schoolproject voor het vak **Domain-Driven Design**. Een systeem voor het beheer en
onderhoud van Rijkswaterstaat-infrastructuur (bruggen, sluizen, tunnels, snelwegen,
dijken, gemalen, stormvloedkeringen), opgebouwd uit vier onafhankelijke **bounded
contexts** — elk een eigen service in een eigen map.

Iedere teamgenoot bouwt zijn eigen service (mogelijk in een eigen stack). De services
praten met elkaar via **REST** (synchrone queries) en **domain events** over RabbitMQ
(asynchrone integratie). Alles draait lokaal met één `docker compose up` en wordt
gehost op **Dokploy**.

## De vier services (bounded contexts)

| Service      | Map            | Poort | Eigenaar | Verantwoordelijkheid                                   |
|--------------|----------------|-------|----------|--------------------------------------------------------|
| **Beheer**   | `beheer/`      | 8004  | _TBD_    | Register van kunstwerken/objecten (bron van waarheid)  |
| **Contract** | `contract/`    | 8001  | _TBD_    | Onderhoudscontracten met aannemers per object          |
| **Monitoring**| `monitoring/` | 8002  | _TBD_    | Conditie-/sensordata en meldingen                      |
| **Onderhoud**| `onderhoud/`   | 8003  | _TBD_    | Inspecties, werkorders en onderhoudsplanning           |

Vul je naam in bij _Eigenaar_ zodra je een service oppakt.

## Snel starten (lokaal)

```bash
cp .env.example .env                 # gedeelde infra-credentials
docker compose up                    # start rabbitmq + postgres
```

- RabbitMQ management UI: http://localhost:15672 (user/pass uit `.env`, standaard `rws`/`rws`)
- Postgres: `localhost:5432` — met een database per context (`beheer_db`, `contract_db`, …)

Je eigen service toevoegen aan de lokale stack:

1. Zet een werkende `Dockerfile` in je servicemap (zie het template dat er al staat).
2. `cp <service>/.env.example <service>/.env`.
3. Uncomment je servicblok in [`docker-compose.yml`](docker-compose.yml).
4. `docker compose up --build`.

## Documentatie

- [docs/ontwerp.md](docs/ontwerp.md) — het ontwerp/de spec (waarom het zo is opgezet)
- [docs/context-map.md](docs/context-map.md) — DDD context map: hoe de contexts zich verhouden
- [docs/conventions.md](docs/conventions.md) — **afspraken** die iedereen volgt (poorten, health, lagen, checklist)
- [docs/events.md](docs/events.md) — het gedeelde event-contract (de "Published Language")
- [docs/dokploy.md](docs/dokploy.md) — deployen op Dokploy (hybride: compose lokaal, per-service Application in productie)

## AI-gedreven bouwen

Dit project wordt met AI-tools (bijv. Claude Code) gebouwd. Daarom staat er een
`CLAUDE.md` in de repo-root, in elke servicemap, én **in elke DDD-laag**
(`domain/`, `application/`, `infrastructure/`, `interface/`). Die bestanden vertellen
de AI precies wat er in die laag hoort en welke afhankelijkheidsregels gelden, zodat de
gegenereerde code de bounded-context-grenzen respecteert.

## Mapstructuur

```
rws-ddd/
├── README.md            · CLAUDE.md          · docker-compose.yml · .env.example
├── docs/                (context-map, conventions, events, dokploy, ontwerp)
├── infra/postgres/init/ (maakt 1 database per context aan)
└── <service>/           (contract | monitoring | onderhoud | beheer)
    ├── README.md   · CLAUDE.md · Dockerfile · .env.example
    ├── domain/         CLAUDE.md   (entities, value objects, events, invarianten)
    ├── application/    CLAUDE.md   (use cases, orkestratie)
    ├── infrastructure/ CLAUDE.md   (DB, RabbitMQ, HTTP-clients)
    └── interface/      CLAUDE.md   (REST-controllers, event-handlers, /health)
```
