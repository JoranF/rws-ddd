# Ontwerp — Beheer service, Fase 2 afronden

_Datum: 2026-07-02 · Bounded context: **Beheer** (Python 3.12 · FastAPI · SQLAlchemy 2 ·
Alembic · pika/RabbitMQ · pytest). Branch: `beheer-service`._

## Doel

De Beheer-context de Fase 2-integratietaken uit `docs/vervolgstappen.md` laten afronden:

1. De **netwerkrapportage** van Monitoring consumeren (customer/supplier) om de
   ontwerpeisen te valideren.
2. Het **onderhoudsrapport** uit `onderhoud.onderhoud.afgerond` (partnership) verwerken
   **terug in het kunstwerk-register** (conditie + inspectiedatum).
3. De validatie op **streng** kunnen zetten (`VALIDATIE`-vlag).
4. **Integratietests** toevoegen (Testcontainers: Postgres + RabbitMQ).

Randvoorwaarde: alleen binnen `beheer/` werken (+ de gedeelde `docs/`). Integratie loopt
uitsluitend via events/REST. Lagen blijven gerespecteerd (`domain` hangt van niets af;
soepel/streng en envelope-mapping horen in application/infrastructure).

## Uitgangssituatie (op `main`)

Fase 1 draait en veel Fase 2 is al voorbereid, maar niet af/kloppend:

- **Domein** bevat al `Kunstwerk`, `Eisenpakket`, `RapportageBeoordeling`, `EisenValidator`.
- **Application** heeft `VerwerkMonitoringRapport` en `VerwerkOnderhoudAfgerond` (beide
  maken alleen een `RapportageBeoordeling`, idempotent via `verwerkt_event`).
- **Infrastructure** heeft twee consumers (`monitoring.rapport.opgesteld`,
  `onderhoud.onderhoud.afgerond`).

### Vastgestelde problemen / gaten

1. **Bug (blokker):** `infrastructure/rabbitmq_consumer.py::_extract_numeric_values` — de
   `list`-tak heeft een verkeerd ingesprongen `continue` (IndentationError → de module
   importeert niet → de consumers starten stil nooit) en de body staat buiten de `for`-lus
   (alleen het laatste item zou verwerkt worden). Geen test importeert deze module, dus het
   glipte door.
2. **Geen `soepel`/`streng`-vlag.** `config.py` kent geen `VALIDATIE`. De rapport-use-cases
   gooien nu altijd `NotFoundError` bij een onbekend `kunstwerkId` → hard nack/drop; geen
   schakelbaar Fase 1-gedrag.
3. **"Terug in het register" ontbreekt.** `VerwerkOnderhoudAfgerond` raakt het `Kunstwerk`
   niet aan.
4. **Geen integratietests.** Alleen unit-tests met in-memory fakes; `testcontainers` is geen
   dependency.
5. **Netwerkrapportage-event.** De consumer bindt `monitoring.rapport.opgesteld` (in
   `events.md` beschreven als incident-rapport voor Contract), terwijl de context-map een
   aparte **netwerkrapportage** Monitoring→Beheer beschrijft.

### Relevante technische feiten

- `rapportage_beoordeling.kunstwerk_id` is een **NOT NULL FK** naar `kunstwerk.id`. Bij een
  onbekend kunstwerk kan er dus **geen** beoordeling worden weggeschreven → *soepel* moet
  overslaan, niet opslaan.
- `infrastructure/db.py` maakt `engine`/`SessionLocal` op **importmoment** aan uit
  `get_settings()`. Dat blokkeert het end-to-end-integratietesten tegen een container-DB.
- `Kunstwerk` heeft al `laatste_inspectiedatum`, maar geen gezondheids-/conditieveld.

## Beslissingen (met de eigenaar afgestemd)

1. **Netwerkrapportage-event:** bind een **nieuw** `monitoring.netwerkrapportage.opgesteld`
   (queue `beheer.monitoring_netwerkrapportage`), vervangt de binding op
   `monitoring.rapport.opgesteld`. Voeg de rij toe aan `docs/events.md` als afgesproken
   published language; markeer als coördinatiepunt richting de (nog te bouwen)
   Monitoring-eigenaar.
2. **Terug in het register = conditie/status:** het onderhoudsrapport werkt de **conditie**
   (gezondheid) van het Kunstwerk bij, plus `laatste_inspectiedatum`. De lifecycle-`status`
   (Geregistreerd/InGebruik/BuitenGebruik/Afgekeurd) wordt **niet** automatisch gewijzigd —
   conditie ≠ levenscyclus.
3. **Integratietests:** Testcontainers met **Postgres + RabbitMQ** (echte event-doorstroom).

## Ontwerp per laag

### Domain

- Nieuwe enum **`Conditie`**: `GOED`, `AANDACHT`, `KRITIEK`, `ONBEKEND`
  (ubiquitous language voor de gezondheid van een kunstwerk).
- `Kunstwerk` krijgt velden `conditie: Conditie` (default `ONBEKEND`) en
  `conditie_bijgewerkt_op: datetime | None`.
- Nieuwe domeinmethode
  `Kunstwerk.verwerk_onderhoudsrapport(rapport_datum: date, resultaat: RapportageResultaat, now: datetime)`:
  - `laatste_inspectiedatum = rapport_datum` (mits ≥ bestaande datum, anders behouden — geen
    terugval bij out-of-order events);
  - `conditie` afgeleid uit `resultaat`:
    `VOLDOET→GOED`, `VOLDOET_NIET→KRITIEK`, `NIET_TE_BEOORDELEN→ONBEKEND`
    (bij `NIET_TE_BEOORDELEN` alleen zetten als er nog geen conditie bekend is);
  - `conditie_bijgewerkt_op = now`.
  - Geen nieuw domain-event (geen consument nodig; YAGNI).
- `RapportageResultaat` importeren in `model.py` blijft binnen de domeinlaag (geen
  framework-afhankelijkheid).

### Application

- Nieuwe waarde **`Validatiebeleid`** (enum `SOEPEL`/`STRENG`) in `application` (orkestratie,
  geen domein-invariant).
- Nieuwe fout **`ValidatieError(ApplicationError)`** voor streng-weigeringen.
- `VerwerkRapportCommand` krijgt een extra veld `rapport_datum: date`.
- `_verwerk_rapport(...)` krijgt het `beleid` mee en gedraagt zich als volgt:
  - **Onbekend `kunstwerkId`:**
    - *soepel* → geen beoordeling (FK), waarschuwing loggen, `verwerkt_event` markeren,
      `None` teruggeven (consumer ackt).
    - *streng* → `ValidatieError` (consumer nackt/dropt; geweigerd).
  - **Buitengebruikgesteld kunstwerk:**
    - *streng* → `ValidatieError`.
    - *soepel* → verwerken (bevinding/log met kanttekening).
  - Reeds verwerkt (`bron_event_id`) → bestaande beoordeling teruggeven (idempotent).
- `VerwerkOnderhoudAfgerond`: na de beoordeling het `Kunstwerk` laden en
  `verwerk_onderhoudsrapport(...)` aanroepen + opslaan. `VerwerkMonitoringRapport` doet dit
  **niet** (alleen ontwerpeisen valideren).
- De use-case-constructors krijgen `beleid: Validatiebeleid`.

### Infrastructure

- **Bugfix** `_extract_numeric_values`: correcte iteratie over `list` én `dict`.
- `config.py`: veld `validatie: str` uit env **`VALIDATIE`** (default `"soepel"`;
  genormaliseerd/gevalideerd naar `soepel|streng`).
- **`db.py` refactor (targeted):** engine/sessionfactory **lazy** aanmaken
  (`get_engine()` / `get_session_factory()`), zodat env pas op gebruiksmoment wordt gelezen.
  `Base` en `check_database()` blijven.
- `main.py`: `get_session_factory()` gebruiken; `settings.validatie` → `Validatiebeleid`
  doorgeven aan de use-case-factories.
- **Consumer:** bind `monitoring.netwerkrapportage.opgesteld`; parse de onderhoud-`datum`
  naar `command.rapport_datum` (fallback `occurredAt.date()`); bij `ValidatieError` nack,
  bij succes/soepel-overslaan ack.
- `models.py` + **nieuwe Alembic-migratie `20260702_0002`**: kolommen `conditie`
  (String, nullable) en `conditie_bijgewerkt_op` (DateTime tz, nullable) op `kunstwerk`.
- `repositories.py`: conditie-velden mappen in beide richtingen.

### Interface

- `KunstwerkResponse` (+ mapper) uitbreiden met `conditie` en `conditieBijgewerktOp`.

## Tests

### Unit (blijft Docker-loos via `pytest`)

- **domain:** conditie-mapping en inspectiedatum-logica van `verwerk_onderhoudsrapport`
  (incl. out-of-order datum en `NIET_TE_BEOORDELEN`-behoud).
- **application:** streng vs soepel (onbekend kunstwerk → overslaan vs `ValidatieError`;
  buitengebruik → weigeren in streng); onderhoudsrapport werkt het register bij;
  netwerkrapportage doet dat niet; idempotentie behouden.
- **infrastructure:** `_extract_numeric_values` voor `dict`- én `list`-vorm (regressie);
  envelope→command-mapping incl. `rapport_datum`.

### Integratie (Testcontainers, marker `integration`, standaard uitgesloten)

- **Postgres:** `alembic upgrade head` op een container; kunstwerk + eisen + beoordeling
  persisteren via de SqlAlchemy-UoW; idempotentie over sessies; conditie persistent.
- **Postgres + RabbitMQ (end-to-end):** echte envelope voor
  `monitoring.netwerkrapportage.opgesteld` én `onderhoud.onderhoud.afgerond` op `rws.events`
  publiceren; verifiëren dat de consumer mapt, de beoordeling opslaat en (onderhoud) het
  register bijwerkt. Vangt de bug uit stap 1.
- Config: `pytest` default `-m "not integration"`; integratie draait met
  `pytest -m integration` (vereist Docker).

## Config, docs & deploy

- `.env.example`, `docker-compose.yml` (beheer-env) en dokploy-notitie: `VALIDATIE=streng`
  als Fase 2-posture (code-default blijft `soepel`).
- `docs/events.md`: rij `monitoring.netwerkrapportage.opgesteld` (producer Monitoring,
  `data`: `kunstwerkId`, `periode`, `resultaten`).
- `beheer/README.md` + `beheer/CLAUDE.md`: geconsumeerde events (netwerkrapportage),
  `VALIDATIE`-vlag, conditie, integratietests, statusregel.

## Definition of Done

- `pytest` groen (unit); `pytest -m integration` groen met Docker.
- `docker compose up --build beheer postgres rabbitmq` → `GET /health` = 200
  (`service`/`database`/`broker` = ok); consumers starten zonder fout.
- Een gepubliceerde `monitoring.netwerkrapportage.opgesteld` levert een
  `RapportageBeoordeling`; een `onderhoud.onderhoud.afgerond` levert een beoordeling **en**
  werkt conditie + `laatste_inspectiedatum` bij.
- `VALIDATIE=streng` weigert rapporten voor onbekende/buitengebruikgestelde kunstwerken;
  `VALIDATIE=soepel` slaat ze over met een waarschuwing.
- Alleen `beheer/` + `docs/` gewijzigd; lagen gerespecteerd.

## Bewust buiten scope

- Automatische lifecycle-statuswijziging op basis van rapporten.
- Een nieuw `beheer.*`-event voor conditie (geen consument).
- Wijzigingen aan andere contexts of hun code/DB.
