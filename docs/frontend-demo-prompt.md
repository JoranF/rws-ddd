# Frontend-demo-prompt

Geef de prompt hieronder (alles tussen de lijnen) aan een AI-tool die in de repo kan
werken (Claude Code, Cursor, …) om een demo-dashboard te genereren. **Elk teamlid
genereert zijn eigen frontend** (eigen stijl, eigen tool — net als de services zelf
stack-divers zijn); alle vier komen ze **in deze repo** onder `frontends/<naam>/` en
worden als eigen Dokploy-app onder een eigen (sub)domein gedeployed — zie
[het Dokploy-plan §3b](superpowers/plans/2026-07-02-dokploy-implementatieplan.md).

**Poortverdeling (kies jouw regel, en gebruik die in de prompt):**

| Teamlid (map)         | Lokale poort | Dokploy-domein         |
|-----------------------|--------------|------------------------|
| `frontends/<naam-1>/` | 8005         | `demo-<naam-1>.<domein>` |
| `frontends/<naam-2>/` | 8006         | `demo-<naam-2>.<domein>` |
| `frontends/<naam-3>/` | 8007         | `demo-<naam-3>.<domein>` |
| `frontends/<naam-4>/` | 8008         | `demo-<naam-4>.<domein>` |

**Gebruik:**
1. Vervang in de prompt eerst de twee placeholders: `<NAAM>` (jouw naam, kleine letters,
   geen spaties) en `<POORT>` (jouw poort uit de tabel).
2. De stack draait lokaal: `docker compose up` in de repo-root (alle vier `/health` groen).
3. Plak de prompt in je AI-tool, geopend in de repo-root. De tool maakt
   `frontends/<NAAM>/` aan (incl. Dockerfile, nginx-config en compose-blok).
4. Ontwikkelen: `cd frontends/<NAAM> && npm install && npm run dev` (Vite, poort 5173).
   Meedraaien in de stack: `docker compose up --build frontend-<NAAM>` →
   http://localhost:<POORT>.
5. Committen op een eigen branch (`frontend-<NAAM>`), PR naar `main` zoals altijd.
   Jij werkt alleen in `frontends/<NAAM>/` + je eigen compose-blok; blijf uit de
   mappen van anderen.

> Waarom de proxy verplicht is: de services sturen geen CORS-headers, dus een browser
> mag niet rechtstreeks naar `localhost:8001-8004`. Lokaal lost de Vite-dev-proxy dat
> op; in Docker/Dokploy doet nginx hetzelfde. De frontend gebruikt daardoor overal
> dezelfde relatieve paden.

---

```text
Bouw een demo-dashboard (single-page webapp) voor "RWS-DDD": een DDD-schoolproject met
vier onafhankelijke microservices (bounded contexts) voor Rijkswaterstaat-
infrastructuurbeheer. Het dashboard is de "regiekamer" voor een live demo tijdens een
presentatie: één scherm waarmee we het hele verhaal klikbaar doorlopen en waarop je
ZIET dat de services via events (RabbitMQ) met elkaar praten.

Je werkt in de monorepo van het project. Maak de frontend aan in de map
`frontends/<NAAM>/` in de repo-root (er komen meerdere frontends naast elkaar — één
per teamlid; blijf uit de andere mappen). De frontend is GEEN bounded context: geen
bedrijfsregels, alleen presentatie + API-aanroepen. Het enige bestand buiten je eigen
map dat je aanraakt is docker-compose.yml, waar je jouw eigen frontend-blok toevoegt
(zie onder).

## Tech-eisen
- Vite + React (TypeScript mag), styling vrij (Tailwind prima). Geen backend-code,
  geen auth.
- De services hebben GEEN CORS-headers. Alle fetches gaan daarom naar RELATIEVE paden
  (/beheer/..., /monitoring/..., enz.); een proxy stuurt ze door. Twee omgevingen,
  zelfde paden:

  (a) Lokaal ontwikkelen — Vite-dev-proxy in vite.config.ts:
  server: {
    proxy: {
      '/contract':   { target: 'http://127.0.0.1:8001', changeOrigin: true, rewrite: p => p.replace(/^\/contract/, '') },
      '/monitoring': { target: 'http://127.0.0.1:8002', changeOrigin: true, rewrite: p => p.replace(/^\/monitoring/, '') },
      '/onderhoud':  { target: 'http://127.0.0.1:8003', changeOrigin: true, rewrite: p => p.replace(/^\/onderhoud/, '') },
      '/beheer':     { target: 'http://127.0.0.1:8004', changeOrigin: true, rewrite: p => p.replace(/^\/beheer/, '') },
    },
  }

  (b) Docker/Dokploy — nginx serveert de statische build en proxyt dezelfde paden naar
  de interne servicenamen. Maak deze twee bestanden in frontend/:

  frontends/<NAAM>/nginx.conf.template:
    server {
      listen 80;
      location = /health { return 200 'ok'; add_header Content-Type text/plain; }
      location /contract/   { proxy_pass ${CONTRACT_URL}/; }
      location /monitoring/ { proxy_pass ${MONITORING_URL}/; }
      location /onderhoud/  { proxy_pass ${ONDERHOUD_URL}/; }
      location /beheer/     { proxy_pass ${BEHEER_URL}/; }
      location / { root /usr/share/nginx/html; try_files $uri /index.html; }
    }

  frontends/<NAAM>/Dockerfile (multi-stage; het nginx-image draait envsubst automatisch
  op /etc/nginx/templates/*.template):
    FROM node:22-alpine AS build
    WORKDIR /app
    COPY package*.json ./
    RUN npm ci
    COPY . .
    RUN npm run build
    FROM nginx:alpine
    COPY --from=build /app/dist /usr/share/nginx/html
    COPY nginx.conf.template /etc/nginx/templates/default.conf.template
    EXPOSE 80

  En voeg dit blok toe aan de root-docker-compose.yml (zelfde stijl als de services;
  laat de blokken van andere frontends staan):
    frontend-<NAAM>:
      build: ./frontends/<NAAM>
      container_name: rws-frontend-<NAAM>
      environment:
        CONTRACT_URL: http://contract:8001
        MONITORING_URL: http://monitoring:8002
        ONDERHOUD_URL: http://onderhoud:8003
        BEHEER_URL: http://beheer:8004
      ports: ["<POORT>:80"]
      depends_on: [contract, monitoring, onderhoud, beheer]
      networks: [rws-net]

  Dus: GET /beheer/api/kunstwerken komt lokaal (dev) uit bij http://127.0.0.1:8004
  en in Docker/Dokploy bij ${BEHEER_URL} — de frontend-code merkt het verschil niet.
  Op Dokploy wordt dit een eigen Application met een eigen subdomein
  (demo-<NAAM>.<domein>); de vier *_URL-env-vars wijzen daar naar de interne
  hostnamen van de service-apps.
- Alle data verandert door events tussen de services: gebruik POLLING (elke 2 s) op de
  lijst-endpoints zodat wijzigingen "vanzelf" zichtbaar worden. Highlight nieuwe rijen
  even (flash/animatie) — dat is het demo-effect.
- Alle timestamps die je verstuurt: ISO-8601 in UTC (eindigend op "Z").
- Foutafhandeling: toon de JSON-foutbody van de service in een toast; een 4xx bij
  "gunning geweigerd" is een FEATURE van de demo (strenge validatie), geen bug.

## Lay-out
- Header met 4 health-badges (elke 5 s pollen): GET /<service>/health → groen bij 200.
  Poorten/namen: contract 8001, monitoring 8002, onderhoud 8003, beheer 8004.
- Daaronder een "Demo-script"-paneel: de genummerde stappen van het demoverhaal
  (zie hieronder) als knoppen die je één voor één afvuurt, met per stap een
  status-vinkje zodra het resultaat zichtbaar is.
- Daarnaast/daaronder 4 context-panelen (Beheer, Monitoring, Onderhoud, Contract),
  elk met hun live-lijsten en losse actie-formulieren voor vrij spelen.
- Teken (statisch, bv. SVG) de context-map-pijlen tussen de panelen:
  Beheer→(kunstwerk/eisen)→Contract+Monitoring+Onderhoud; Monitoring→(incident)→Onderhoud;
  Monitoring→(rapport)→Beheer+Contract; Contract→(gegund)→Onderhoud;
  Onderhoud→(onderhoudsrapport)→Beheer. Laat een pijl oplichten als de bijbehorende
  demo-stap loopt.

## Demo-script (de gouden route — deze volgorde is verplicht, want alle consumers
## staan op strenge validatie: een service kent een kunstwerk pas na het event)
1. BEHEER — kunstwerk registreren:
   POST /beheer/api/kunstwerken  {"kunstwerkId":"KW-DEMO-1","naam":"Brug A12","type":"Brug","locatie":"A12 km 4"}
2. BEHEER — eisen vaststellen:
   POST /beheer/api/kunstwerken/KW-DEMO-1/onderhoudseisen
     {"eisen":[{"code":"SPOOR","omschrijving":"Spoorvorming maximaal","meetwaarde":"spoorvorming","operator":"<=","grenswaarde":8,"eenheid":"mm"}]}
   POST /beheer/api/kunstwerken/KW-DEMO-1/ontwerpeisen
     {"eisen":[{"code":"TRIL","omschrijving":"Trillingsnorm","meetwaarde":"trilling","operator":"<=","grenswaarde":5,"eenheid":"mm/s"}]}
3. MONITORING — sessie starten (werkt pas zodra het kunstwerk-event verwerkt is; retry
   met polling tot 201): POST /monitoring/api/sessies {"kunstwerkId":"KW-DEMO-1"}
4. MONITORING — normale meting (geen incident):
   POST /monitoring/api/metingen {"kunstwerkId":"KW-DEMO-1","sensorType":"Trilling","waarde":3}
   Dan een KRITIEKE meting: {"kunstwerkId":"KW-DEMO-1","sensorType":"Trilling","waarde":12}
   → toon het incident uit GET /monitoring/api/incidenten?kunstwerkId=KW-DEMO-1
   (drempels: Trilling 5 mm/s, Belasting 100 kN, Temperatuur 40 °C, Slijtage 60%;
    waarde/drempel <1.25 Laag, <1.5 Middel, <2 Hoog, anders Kritiek)
5. ONDERHOUD — NIETS klikken: het traject verschijnt vanzelf (event!) in
   GET /onderhoud/api/onderhoud (bij ernst Hoog/Kritiek wordt automatisch gepland).
   Dit is hét wow-moment: maak het visueel.
6. CONTRACT — aanbesteding: POST /contract/api/aanbestedingen
     {"kunstwerkId":"KW-DEMO-1","sluitingsdatum":"<nu+7d ISO>","prijsgewicht":60,"kwaliteitsgewicht":40}
   → 2 inschrijvingen: POST /contract/api/aanbestedingen/{id}/inschrijvingen
     {"aannemer":"BAM Infra","prijs":120000,"kwaliteitsscore":8} en een tweede
   → gunnen (EMVI): POST /contract/api/aanbestedingen/{id}/gunning
     {"looptijdStart":"<vandaag yyyy-MM-dd>","looptijdEind":"<+1 jaar>"}
   Bewaar het teruggegeven contractId.
7. MONITORING — rapport: POST /monitoring/api/rapporten
     {"kunstwerkId":"KW-DEMO-1","periodeStart":"<nu-7d ISO Z>","periodeEind":"<nu ISO Z>"}
   → verschijnt vanzelf bij BEHEER: GET /beheer/api/rapportage-beoordelingen?kunstwerkId=KW-DEMO-1
8. CONTRACT — prestatieverklaring ZONDER score (score komt automatisch uit de
   monitoring-KPI — conformist-relatie): POST /contract/api/contracten/{contractId}/prestatieverklaringen
     {"periodeStart":"<vandaag>","periodeEind":"<+30d>","bedrag":25000}
9. ONDERHOUD — traject uitvoeren: POST /onderhoud/api/onderhoud/{id}/start {"datum":"<nu ISO Z>"}
   → inspectie: POST .../inspecties {"datum":"<nu ISO Z>","oordeel":"Goedgekeurd"}
   → afronden: POST .../afronden {"resultaat":"Lagers vervangen, trillingsniveau genormaliseerd","datum":"<nu ISO Z>"}
   → verschijnt vanzelf als Onderhoudsrapport-beoordeling bij BEHEER (zelfde lijst als stap 7).
10. MONITORING — incident oplossen: POST /monitoring/api/incidenten/{id}/oplossing
11. FINALE (strenge validatie): probeer een aanbesteding + gunning voor kunstwerkId
    "KW-BESTAAT-NIET" → de gunning wordt geweigerd met een domeinfout. Toon die fout
    prominent en positief ("streng: alleen bekende kunstwerken").

## Overige endpoints voor de vrije panelen (alles JSON, geen auth)
- BEHEER: GET /api/kunstwerken · GET /api/kunstwerken/{id} · PATCH /api/kunstwerken/{id}
  · POST /api/kunstwerken/{id}/buitengebruikstelling · GET /api/kunstwerken/{id}/eisen
  · GET /api/rapportage-beoordelingen?kunstwerkId=&rapportageType=
- MONITORING: GET /api/sessies · POST /api/sessies/{id}/pauzering|hervatting|afronding
  · GET /api/metingen?kunstwerkId= · GET /api/incidenten?status=&kunstwerkId=
  · POST /api/incidenten/{id}/inbehandelingname · GET /api/rapporten?kunstwerkId=
  · POST /api/netwerkrapportages {"periodeStart":"...","periodeEind":"..."}
- ONDERHOUD: POST /api/storingen {"kunstwerkId","omschrijving","ernst":"Laag|Middel|Hoog|Kritiek"}
  · GET /api/storingen · POST /api/diagnoses {"kunstwerkId","bevinding","ernst","incidentId"?}
  · POST /api/onderhoud/{id}/facturen {"bedragEuro":1234,"ontvangenOp":"<ISO Z>"}
  · POST /api/onderhoud/{id}/facturen/{factuurId}/goedkeuring · POST /api/schemas
  · POST /api/contractaanvragen · POST /api/extern/facturen (anti-corruption layer)
- CONTRACT: GET /api/aanbestedingen(/{id}) · GET /api/contracten?kunstwerkId=
  · POST /api/contracten/{id}/wijzigingen · POST /api/contracten/{id}/afronding
- Elke service heeft OpenAPI-docs voor details: beheer /docs, de rest /api/docs.
- Leuk extraatje voor de demo: link naar de RabbitMQ-management-UI
  (http://localhost:15672, user rws / pass rws) om de queues live te laten zien.

## Stijl
Strak "control room"-dashboard, Rijkswaterstaat-geel (#f9e11e) als accentkleur op een
donker thema, duidelijke NL-labels, grote leesbare status-badges (presentatie op een
beamer!). Ernst-kleuren: Laag grijs, Middel geel, Hoog oranje, Kritiek rood.
```
