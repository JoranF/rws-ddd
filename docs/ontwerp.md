# Ontwerp / Spec — RWS-DDD

_Datum: 2026-07-01 · Status: vastgesteld (skelet-fase)_

> **Leidend:** de inhoudelijke analyse en het ontwerp staan in het DDD-verslag
> [DDD verslag, Laurens, Sven, Joran, Kaleb.docx](DDD%20verslag,%20Laurens,%20Sven,%20Joran,%20Kaleb.docx).
> Dit `ontwerp.md` legt alleen de **repo-/skelet-beslissingen** vast; bij twijfel over het
> domein wint het verslag.

## Doel
Een monorepo-skelet voor een DDD-schoolproject: vier onafhankelijke bounded contexts
rond Rijkswaterstaat-infrastructuurbeheer. Dit document legt de genomen beslissingen
vast. De services zelf worden later per teamgenoot ingevuld.

## Domein
Beheer en onderhoud van RWS-**kunstwerken** (bruggen, sluizen, tunnels, snelwegen,
dijken, gemalen, stormvloedkeringen). Vier contexts:

- **Beheer** — kunstwerk-register + eisen (onderhouds-/ontwerpeisen); bron van waarheid voor `KunstwerkId`.
- **Contract** — onderhoudscontracten & aanbestedingen (EMVI) met aannemers per kunstwerk.
- **Monitoring** — sensordata, afwijkingen, incidenten en rapportages.
- **Onderhoud** — storingen, diagnoses, onderhoudsschema's, inspecties en facturen.

De term voor een stuk infrastructuur is **kunstwerk** (`KunstwerkId`); alleen Contract
noemt dit in zijn eigen taal soms "object". Zie [context-map.md](context-map.md) voor de
relaties (partnership Beheer↔Onderhoud, conformist Monitoring→Contract, ACL's).

## Beslissingen
1. **Scope nu:** stack-agnostisch skelet + Dokploy-opzet + conventies. Geen service-code.
2. **"AI-driven" = bouwgereedschap:** het team ontwikkelt met AI-tools; het product hoeft
   zelf geen AI te bevatten. Daarom een `CLAUDE.md` in root, per service én per laag.
3. **Team:** vier leden, elk één service in een eigen map, mogelijk elk een eigen stack.
4. **Integratie:** REST (synchrone queries) + async domain events over RabbitMQ
   (topic exchange `rws.events`, vaste envelope). Zie [events.md](events.md).
5. **Data:** database per context (DDD). Lokaal één Postgres met vier databases. Een
   eigenaar mag een andere opslag kiezen (het verslag stelt voor: Beheer→MySQL op Python,
   Monitoring→DynamoDB); de gedeelde Postgres blijft het skelet-gemak. Zie conventions §6.
8. **Monitoring = eigen bounded context:** het verslag groepeert Monitoring in het
   gezamenlijke model soms onder "Beheer/Asset management", maar we houden het als eigen
   context aan — consistent met de rest van het verslag en de service-opdeling.
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
