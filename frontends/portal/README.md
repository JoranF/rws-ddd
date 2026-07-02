# Frontend — Portal (RWS Infraportaal)

Werkportaal voor RWS-DDD: één app met een demo-login en per bounded context een eigen
set werkschermen. Elke rol werkt in zijn eigen context; de andere contexts zijn
zichtbaar maar **alleen-lezen** — zo zie je de DDD-grenzen letterlijk in de UI.
**Alle data is live** uit de draaiende services — geen mocks, geen fallback-data.

Ontwerp: `docs/superpowers/specs/2026-07-02-portal-frontend-design.md`.

## Demo-gebruikers

| E-mail       | Rol               | Eigen context |
|--------------|-------------------|---------------|
| anna@rws.nl  | Beheerder         | Beheer        |
| mark@rws.nl  | Monitoringanalist | Monitoring    |
| kees@bam.nl  | Aannemer          | Onderhoud     |
| lisa@rws.nl  | Contractmanager   | Contract      |

Wachtwoord voor iedereen: `rws-demo`. De login is frontend-only (localStorage) —
een rollenmodel voor het verhaal, geen security-feature; de service-API's blijven open.

## Lokaal ontwikkelen

De stack moet draaien (repo-root: `docker compose up`, services op 8001-8004).

```bash
cd frontends/portal
npm install
npm run dev            # Vite op http://localhost:5174 (proxy → 8001-8004)
```

## Meedraaien in de stack (Docker)

```bash
docker compose up --build frontend-portal   # → http://localhost:8006
```

## Dokploy

Eigen Application, subdomein `portal.<domein>`. De env-vars
`CONTRACT_URL/MONITORING_URL/ONDERHOUD_URL/BEHEER_URL` wijzen naar de interne
hostnamen van de service-apps; nginx proxyt de relatieve paden daarheen.

## Waarom een proxy?

De services sturen geen CORS-headers. De browser mag dus niet rechtstreeks naar
`localhost:8001-8004`. Lokaal lost de Vite-dev-proxy dat op, in Docker/Dokploy doet
nginx hetzelfde — de frontend gebruikt overal dezelfde relatieve paden onder `/svc/`
(`/svc/beheer/...`, `/svc/monitoring/...`, enz.). De `/svc`-prefix houdt het
API-verkeer gescheiden van de SPA-routes (`/beheer`, `/monitoring`, ...), anders zou
een harde refresh op zo'n route bij de proxy uitkomen in plaats van bij de app.
