# Deployen op Dokploy (hybride)

**Lokaal** draai je alles met één `docker compose up`. **In productie** krijgt elke
service een eigen Dokploy *Application* uit dezelfde monorepo, zodat elke teamgenoot
onafhankelijk kan deployen. De gedeelde infra (RabbitMQ, Postgres) draait één keer.

## Overzicht
```
Dokploy Project: "RWS-DDD"
├── Application: beheer      (Build Path /beheer,      domain beheer.<jouwdomein>)
├── Application: contract    (Build Path /contract,    domain contract.<jouwdomein>)
├── Application: monitoring  (Build Path /monitoring,  domain monitoring.<jouwdomein>)
├── Application: onderhoud   (Build Path /onderhoud,   domain onderhoud.<jouwdomein>)
├── RabbitMQ    (Compose-service op het dokploy-network)
└── Postgres    (Dokploy database-resource, 1 db per context)
```
Alles hangt aan het gedeelde **`dokploy-network`**, zodat services elkaar én de infra op
naam bereiken (net als lokaal via containernaam).

## Eenmalig (door één teamlid)
1. Maak een Dokploy **Project** "RWS-DDD".
2. **Postgres**: maak een database-resource aan. Maak vier databases
   (`beheer_db`, `contract_db`, `monitoring_db`, `onderhoud_db`) of vier resources.
3. **RabbitMQ**: RabbitMQ zit niet in Dokploy's native database-lijst — voeg hem toe als
   kleine **Docker Compose**-service (image `rabbitmq:3-management`) binnen het project,
   aangesloten op het `dokploy-network`. Noteer de interne hostnaam.
4. Deel de connection-strings met het team als env-waarden (zie hieronder).

## Per service (door de eigenaar)
1. Nieuwe **Application** in het project, gekoppeld aan deze Git-repo.
2. **Build Path / Base Directory** = `/<jouwservice>` (bv. `/beheer`).
3. **Build Type** = Dockerfile (of Nixpacks als je geen Dockerfile gebruikt).
4. **Environment variables**:
   ```
   SERVICE_PORT=<jouw poort>
   DATABASE_URL=postgres://<user>:<pass>@<postgres-host>:5432/<jouw_db>
   RABBITMQ_URL=amqp://<user>:<pass>@<rabbitmq-host>:5672
   ```
5. **Domain**: koppel een (sub)domein; Dokploy/Traefik regelt HTTPS. Zet het poortdoel
   op je `SERVICE_PORT`.
6. **Health check path** = `/health`.
7. Deploy. Volgende deploys: push naar de branch of klik Deploy — alleen jouw service.

## Let op
- Zorg dat elke Application op het **`dokploy-network`** zit, anders vinden ze elkaar niet.
- Gebruik interne hostnamen voor service-naar-service en infra-verkeer; het publieke
  (sub)domein is voor verkeer van buitenaf.
- Referentie: Dokploy docs — Applications/Build Type en Docker Compose.
