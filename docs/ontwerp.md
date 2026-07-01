# Ontwerp / Spec — RWS-DDD

_Datum: 2026-07-01 · Status: vastgesteld (skelet-fase)_

## Doel
Een monorepo-skelet voor een DDD-schoolproject: vier onafhankelijke bounded contexts
rond Rijkswaterstaat-infrastructuurbeheer. Dit document legt de genomen beslissingen
vast. De services zelf worden later per teamgenoot ingevuld.

## Domein
Beheer en onderhoud van RWS-infrastructuur (bruggen, sluizen, tunnels, snelwegen,
dijken, gemalen, stormvloedkeringen). Vier contexts:

- **Beheer** — register van objecten; bron van waarheid voor `ObjectId`.
- **Contract** — onderhoudscontracten met aannemers per object.
- **Monitoring** — conditie-/sensordata en meldingen.
- **Onderhoud** — inspecties, werkorders en planning.

Zie [context-map.md](context-map.md) voor de relaties.

## Beslissingen
1. **Scope nu:** stack-agnostisch skelet + Dokploy-opzet + conventies. Geen service-code.
2. **"AI-driven" = bouwgereedschap:** het team ontwikkelt met AI-tools; het product hoeft
   zelf geen AI te bevatten. Daarom een `CLAUDE.md` in root, per service én per laag.
3. **Team:** vier leden, elk één service in een eigen map, mogelijk elk een eigen stack.
4. **Integratie:** REST (synchrone queries) + async domain events over RabbitMQ
   (topic exchange `rws.events`, vaste envelope). Zie [events.md](events.md).
5. **Data:** database per context (DDD). Lokaal één Postgres met vier databases.
6. **Deploytopologie:** hybride — lokaal één `docker compose up`; in productie per service
   een eigen Dokploy *Application* + gedeelde RabbitMQ/Postgres. Zie [dokploy.md](dokploy.md).
7. **Interne structuur:** vier lagen (domain/application/infrastructure/interface) met de
   afhankelijkheidsregel naar binnen. Elke laag heeft eigen `CLAUDE.md`-guidance.

## Niet in scope (YAGNI)
- Geen gedeelde codebibliotheek of framework tussen services (elke stack is vrij).
- Geen AI-features in het product.
- Geen CI/CD-pipeline of tests op skeletniveau — die horen bij de service-implementatie.
- Geen API-gateway; services zijn direct benaderbaar via hun eigen (sub)domein.

## Vervolg
Elke teamgenoot doorloopt de checklist in [conventions.md](conventions.md) om zijn
service toe te voegen: lagen invullen, `/health`, events, `Dockerfile`, compose-blok,
en deploy op Dokploy.
