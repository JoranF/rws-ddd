# Beheer

Bounded context: **kunstwerk-register + eisen**. Beheer is de bron van waarheid
voor `KunstwerkId`, basisgegevens van kunstwerken, onderhoudseisen,
ontwerpeisen en de beoordeling van rapportages uit Monitoring en Onderhoud.

- **Poort:** 8004
- **Database:** `beheer_db` via `DATABASE_URL`
- **Stack:** Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, RabbitMQ
- **Eigenaar:** _TBD_

## Verantwoordelijkheden

- Kunstwerken registreren, wijzigen, tonen en buiten gebruik stellen.
- Basisgegevens beheren: type, locatie, status, beheerder en inspectiedatum.
- Onderhoudseisen en ontwerpeisen vaststellen en versioneren.
- Netwerkrapportages beoordelen tegen ontwerpeisen.
- Onderhoudsrapporten beoordelen tegen onderhoudseisen.
- Events publiceren en consumeren volgens `../docs/events.md`.

## REST API

FastAPI publiceert OpenAPI op `/docs`. Alle endpoints behalve `/health` staan
onder `/api`.

| Methode + pad | Doel |
| --- | --- |
| `POST /api/kunstwerken` | Kunstwerk registreren |
| `GET /api/kunstwerken` | Kunstwerken zoeken |
| `GET /api/kunstwerken/{kunstwerkId}` | Kunstwerk ophalen |
| `PATCH /api/kunstwerken/{kunstwerkId}` | Basisgegevens wijzigen |
| `POST /api/kunstwerken/{kunstwerkId}/buitengebruikstelling` | Kunstwerk buiten gebruik stellen |
| `POST /api/kunstwerken/{kunstwerkId}/onderhoudseisen` | Onderhoudseisen vaststellen |
| `POST /api/kunstwerken/{kunstwerkId}/ontwerpeisen` | Ontwerpeisen vaststellen |
| `GET /api/kunstwerken/{kunstwerkId}/eisen` | Alle eisenpakketten ophalen |
| `GET /api/kunstwerken/{kunstwerkId}/onderhoudseisen` | Laatste onderhoudseisen ophalen |
| `GET /api/kunstwerken/{kunstwerkId}/ontwerpeisen` | Laatste ontwerpeisen ophalen |
| `GET /api/rapportage-beoordelingen` | Rapportagebeoordelingen zoeken |
| `GET /api/rapportage-beoordelingen/{beoordelingId}` | Rapportagebeoordeling ophalen |
| `GET /health` | Healthcheck voor service, database en broker |

## Events

Publiceert op topic exchange `rws.events`:

- `beheer.kunstwerk.geregistreerd`
- `beheer.kunstwerk.buitengebruikgesteld`
- `beheer.onderhoudseisen.vastgesteld`
- `beheer.ontwerpeisen.vastgesteld`

Consumeert met eigen durable queues:

- `monitoring.rapport.opgesteld`
- `onderhoud.onderhoud.afgerond`

Consumers zijn idempotent via tabel `verwerkt_event`. Inkomende envelopes worden
in `infrastructure` vertaald naar application commands; het domein kent geen
RabbitMQ- of JSON-details.

## Lokaal draaien

```powershell
cd beheer
copy .env.example .env
python -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
.\.venv\Scripts\alembic upgrade head
.\.venv\Scripts\uvicorn infrastructure.main:app --host 0.0.0.0 --port 8004
```

Met Docker Compose vanaf de repo-root:

```powershell
copy beheer\.env.example beheer\.env
docker compose up --build beheer
```

## Tests

```powershell
cd beheer
python -m pytest
```

De testset dekt domeininvarianten, application use cases met in-memory fakes,
eisenversies, idempotente rapportverwerking en RabbitMQ-envelope mapping.

## Rooktest

```powershell
curl http://localhost:8004/health

curl -X POST http://localhost:8004/api/kunstwerken `
  -H "Content-Type: application/json" `
  -d "{\"kunstwerkId\":\"KW-1\",\"naam\":\"Brug A\",\"type\":\"Brug\",\"locatie\":\"A12 km 4\"}"

curl http://localhost:8004/api/kunstwerken/KW-1

curl -X POST http://localhost:8004/api/kunstwerken/KW-1/onderhoudseisen `
  -H "Content-Type: application/json" `
  -d "{\"eisen\":[{\"code\":\"SPOOR\",\"omschrijving\":\"Spoorvorming maximaal\",\"meetwaarde\":\"spoorvorming\",\"operator\":\"<=\",\"grenswaarde\":8,\"eenheid\":\"mm\"}]}"
```

## Omgeving

```text
SERVICE_PORT=8004
DATABASE_URL=postgresql+psycopg://rws:rws@postgres:5432/beheer_db
RABBITMQ_URL=amqp://rws:rws@rabbitmq:5672
ENABLE_RABBITMQ_CONSUMERS=true
```
