# CI/CD — poortwachter vóór productie

Doel: **geen enkele deploy zonder groene tests.** De pipeline staat in
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) en test per push/PR naar `main`
alleen de bounded context(s) die je hebt gewijzigd — dezelfde scheiding als de `watchPaths`
in Dokploy.

## Wat draait er per context
| Context | Runtime | Stappen |
|---------|---------|---------|
| contract | Node 22 | `npm ci` → `prisma generate` → `npm run build` → `npm test` (vitest) |
| onderhoud | Node 22 | `npm ci` → `npm run build` (nest) → `npm test` (jest) |
| beheer | Python 3.12 | `pip install -e ".[dev]"` → `ruff check` (informatief) → `pytest` |
| monitoring | .NET 10 | `dotnet test` op `Monitoring.UnitTests` |
| portal | Node 22 | `npm ci` → `npm run build` (vite) |

De integratie-/e2e-tests (testcontainers) draaien bewust **niet** in deze basis-pipeline
omdat ze Docker-services opstarten; voeg ze later toe als aparte job wanneer gewenst.

## Deploy pas ná groen (aanzetten in 3 stappen)
Nu staat in Dokploy per Application **autoDeploy = aan**: elke push deployt direct. Om de
poortwachter scherp te zetten:

1. **Zet autoDeploy uit** op elke Application in Dokploy (Deployments → Auto Deploy).
2. **Voeg de deploy-webhooks toe** als GitHub *Secrets* (Settings → Secrets and variables →
   Actions). Per service de Dokploy-webhook-URL:
   `DOKPLOY_CONTRACT_WEBHOOK`, `DOKPLOY_MONITORING_WEBHOOK`, `DOKPLOY_ONDERHOUD_WEBHOOK`,
   `DOKPLOY_BEHEER_WEBHOOK`, `DOKPLOY_PORTAL_WEBHOOK`. De URL vind je in Dokploy onder de
   Application → *Deployments* → *Webhook URL* (of genereer met de refreshToken).
3. **Zet de variabele** `DEPLOY_ENABLED = true` (Settings → Variables → Actions).

Daarna geldt: push naar `main` → tests draaien → **alleen bij groen** roept de `deploy`-job
de webhook aan, en enkel voor de service(s) die wijzigden. Ontbreekt een webhook-secret, dan
slaat die service netjes over (geen harde fout).

## OTAP / staging (aanbevolen vervolgstap)
Maak in Dokploy een tweede *environment* (bv. `staging`) met dezelfde services op branch
`develop`. Promoot naar productie via een merge `develop → main` of via git-tags. Zo test je
elke wijziging in een omgeving die identiek is aan productie vóór hij live gaat.
