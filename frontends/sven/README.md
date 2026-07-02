# Frontend — Sven (regiekamer)

Demo-dashboard voor RWS-DDD. Eén scherm om tijdens de presentatie het hele verhaal
klikbaar door te lopen en te laten zien dat de vier bounded contexts via events
(RabbitMQ) met elkaar praten. **Alle data is live** uit de draaiende services — geen
mocks, geen fixtures, geen fallback-data.

## Lokaal ontwikkelen

De stack moet draaien (repo-root: `docker compose up`, services op 8001-8004).

```bash
cd frontends/sven
npm install
npm run dev            # Vite op http://localhost:5173 (proxy → 8001-8004)
```

## Meedraaien in de stack (Docker)

```bash
docker compose up --build frontend-sven   # → http://localhost:8005
```

## Dokploy

Eigen Application, subdomein `demo-sven.<domein>`. De env-vars
`CONTRACT_URL/MONITORING_URL/ONDERHOUD_URL/BEHEER_URL` wijzen naar de interne
hostnamen van de service-apps; nginx proxyt de relatieve paden daarheen.

## Waarom een proxy?

De services sturen geen CORS-headers. De browser mag dus niet rechtstreeks naar
`localhost:8001-8004`. Lokaal lost de Vite-dev-proxy dat op, in Docker/Dokploy doet
nginx hetzelfde — de frontend gebruikt overal dezelfde relatieve paden
(`/beheer/...`, `/monitoring/...`, enz.).
