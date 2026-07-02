# RWS Infraportaal — ontwerp (frontends/portal)

_Datum: 2026-07-02 · Eigenaar: Joran · Status: goedgekeurd, direct door naar bouw._

## Doel

Svens regiekamer (poort 8005) is een demo-scherm voor de presentatie. Dit portaal is de
volgende stap: één frontend die voelt als een **echte tool** — met login, rollen en per
bounded context een eigen set werkschermen. De vier services blijven volledig
onaangeraakt; integratie loopt uitsluitend via hun bestaande REST-API's (gouden regels).

## Besluiten (met de gebruiker doorgenomen)

| Vraag | Besluit |
|---|---|
| Structuur | Eén portal-app met rollen; login bepaalt je startdashboard |
| Auth-diepte | Demo-login, alleen frontend (localStorage), geen backend-werk |
| Locatie | Nieuwe map `frontends/portal`, eigen container op poort **8006**; Svens frontend blijft op 8005 |
| Scope | Werkschermen per context: overzichtstabel → detailpagina → acties, gedekt door de volledige REST-API van die service |
| Rollenmodel | Eigen context volledig bewerkbaar; de andere drie contexts zichtbaar maar **read-only** (actie-UI verborgen + banner) |
| Data-laag | TanStack Query + React Router |

## Architectuur

- **Stack:** React + Vite + TypeScript, `react-router-dom`, `@tanstack/react-query`.
- **Proxy-patroon zoals Svens frontend:** alle API-paden relatief (`/beheer/...`,
  `/monitoring/...`, `/onderhoud/...`, `/contract/...`). Lokaal lost de Vite-dev-proxy
  dat op, in Docker/Dokploy een nginx-template met `CONTRACT_URL`/`MONITORING_URL`/
  `ONDERHOUD_URL`/`BEHEER_URL`. Geen CORS-aanpassingen in de services nodig.
- **Compose:** nieuw blok `frontend-portal` (poort 8006) naast `frontend-sven`.

## Login & rollen (frontend-only)

Vier demo-gebruikers, één per bounded context, vast demo-wachtwoord (hint op het
loginscherm):

| Gebruiker | Rol | Eigen context |
|---|---|---|
| anna@rws.nl | Beheerder | Beheer |
| mark@rws.nl | Monitoringanalist | Monitoring |
| kees@bam.nl | Aannemer | Onderhoud |
| lisa@rws.nl | Contractmanager | Contract |

- Sessie in `localStorage`; route-guard stuurt niet-ingelogden naar `/login`.
- Na inloggen land je op het dashboard van je eigen context.
- Andere contexts: pagina's zichtbaar, maar formulieren/actieknoppen verborgen en een
  banner "Alleen lezen — dit is de context van de <rol>". De DDD-grenzen zijn zo
  letterlijk zichtbaar in de UI.
- Bewust géén beveiliging op service-niveau: de API's blijven open. Dit is een
  demo-login voor het verhaal, geen security-feature.

## Pagina's per context

Afgeleid van wat de REST-API's echt aanbieden (geverifieerd tegen de service-code;
Svens panels/demo-script als referentie van werkende calls).

- **Beheer** — dashboard (KPI's: kunstwerken, buiten gebruik, eisen) · kunstwerken-tabel
  → detail (onderhouds-/ontwerpeisen, rapportage-beoordelingen; acties: eis toevoegen,
  buiten gebruik stellen) · kunstwerk registreren.
- **Monitoring** — dashboard (open incidenten, actieve sessies) · sessies (starten) ·
  metingen (registreren, filter per kunstwerk) · incidenten → detail (oplossen) ·
  rapporten (opstellen).
- **Onderhoud** — dashboard (open storingen, lopende trajecten) · storingen (melden) ·
  onderhoudstrajecten → detail (starten, inspectie toevoegen, afronden).
- **Contract** — dashboard (lopende aanbestedingen, actieve contracten) · aanbestedingen
  → detail (inschrijvingen toevoegen, gunnen) · contracten → detail (prestatieverklaring
  indienen).
- Sidebar: navigatie per context + health-stipje per service (`GET /<service>/health`).
- UI in het Nederlands; ubiquitous language uit de service-README's — geen synoniemen.

## Foutafhandeling & verversing

- Lijsten verversen automatisch (TanStack Query `refetchInterval` ~5 s).
- Na elke mutatie: invalidatie van de betrokken queries — de lijst ververst direct.
- Geen mocks, geen fallback-data: faalt een request, dan toont de UI de echte
  foutmelding van de service (toast + foutstatus op de pagina). Service down → rood
  health-stipje.

## Testen & verificatie

- TypeScript strict; `npm run build` moet schoon zijn.
- Verificatie tegen de live compose-stack: alle vier services op, per rol inloggen,
  elke pagina en elke actie doorlopen.
- Geen aparte frontend-testsuite (bewuste afweging voor dit schoolproject).

## Buiten scope

- Wijzigingen aan de vier services (andermans contexts) — verboden terrein.
- Echte authenticatie/JWT, gebruikersbeheer, wachtwoord-reset.
- Vervanging van Svens regiekamer; die blijft het demo-scherm voor de presentatie.
