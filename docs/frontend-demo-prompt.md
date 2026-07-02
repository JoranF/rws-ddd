# Frontend-demo-prompt

Geef de prompt hieronder (alles tussen de lijnen) aan een AI-tool naar keuze
(Claude, ChatGPT, v0, Lovable, Claude Code, Cursor, …) om een demo-frontend te
genereren die alle vier de services aanstuurt. Iedereen mag zijn eigen stijl/tool
kiezen — de API-contracten en de proxy-config in de prompt zorgen dat het werkt.

**Vereisten om de gegenereerde frontend te draaien:**
1. De stack draait lokaal: `docker compose up` in de repo-root (alle vier `/health` groen).
2. Node 22 geïnstalleerd; `npm install && npm run dev` in de gegenereerde frontend-map.
3. De frontend NIET in deze repo committen — het is een los demo-project
   (of zet hem in een eigen map/repo).

> Waarom de proxy verplicht is: de services sturen geen CORS-headers, dus een browser
> mag niet rechtstreeks naar `localhost:8001-8004`. De Vite-proxy in de prompt lost dat op.

---

```text
Bouw een demo-dashboard (single-page webapp) voor "RWS-DDD": een DDD-schoolproject met
vier onafhankelijke microservices (bounded contexts) voor Rijkswaterstaat-
infrastructuurbeheer. Het dashboard is de "regiekamer" voor een live demo tijdens een
presentatie: één scherm waarmee we het hele verhaal klikbaar doorlopen en waarop je
ZIET dat de services via events (RabbitMQ) met elkaar praten.

## Tech-eisen
- Vite + React (TypeScript mag), styling vrij (Tailwind prima). Geen backend, geen auth.
- De services hebben GEEN CORS-headers. Gebruik daarom EXACT deze Vite-proxy en laat
  alle fetches naar relatieve paden gaan (/beheer/..., /monitoring/..., enz.):

  // vite.config.ts
  server: {
    proxy: {
      '/contract':   { target: 'http://127.0.0.1:8001', changeOrigin: true, rewrite: p => p.replace(/^\/contract/, '') },
      '/monitoring': { target: 'http://127.0.0.1:8002', changeOrigin: true, rewrite: p => p.replace(/^\/monitoring/, '') },
      '/onderhoud':  { target: 'http://127.0.0.1:8003', changeOrigin: true, rewrite: p => p.replace(/^\/onderhoud/, '') },
      '/beheer':     { target: 'http://127.0.0.1:8004', changeOrigin: true, rewrite: p => p.replace(/^\/beheer/, '') },
    },
  }

  Dus: GET /beheer/api/kunstwerken komt uit bij http://127.0.0.1:8004/api/kunstwerken.
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
