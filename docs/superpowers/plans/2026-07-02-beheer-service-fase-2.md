# Beheer service — Fase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rond de Fase 2-integratie van de Beheer-context af: consumeer de netwerkrapportage van Monitoring, verwerk het onderhoudsrapport terug in het kunstwerk-register (conditie), maak de validatie schakelbaar naar streng, en dek alles met unit- én Testcontainers-integratietests.

**Architecture:** DDD-lagen (`domain` → `application` → `infrastructure`/`interface`). De soepel/streng-keuze en envelope-mapping horen in application/infrastructure; het domein blijft framework-vrij. Consumers zijn idempotent (dedupe op `eventId` via `verwerkt_event`).

**Tech Stack:** Python 3.12 · FastAPI · SQLAlchemy 2 · Alembic · pika (RabbitMQ topic-exchange `rws.events`) · pytest · testcontainers.

## Global Constraints

- Werk uitsluitend in `beheer/` + de gedeelde `docs/`. Raak geen andere context aan.
- Poort **8004**, DB `beheer_db`, exchange `rws.events`, envelope volgens `docs/events.md`.
- `domain` importeert geen framework/DB/broker.
- Ubiquitous language: Kunstwerk, Eisenpakket, Ontwerpeisen, Onderhoudseisen, RapportageBeoordeling, Conditie, Netwerkrapportage, Onderhoudsrapport.
- Code-default `VALIDATIE=soepel`; Fase 2-posture in `.env`/compose = `streng`.
- Elke taak eindigt met een commit. Commitstijl: `type(beheer): ...`, met trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Draai commando's vanuit `beheer/`. Tests: `python -m pytest` (unit); `python -m pytest -m integration` (integratie, vereist Docker).

---

## File Structure

**Domain**
- `domain/model.py` — `Conditie` enum; `Kunstwerk` velden `conditie`/`conditie_bijgewerkt_op` + methode `verwerk_onderhoudsrapport`.

**Application**
- `application/validatie.py` (nieuw) — `Validatiebeleid` enum.
- `application/errors.py` — `ValidatieError`.
- `application/dto.py` — `VerwerkRapportCommand.rapport_datum`.
- `application/use_cases.py` — beleid + register-feedback in `_verwerk_rapport` / beide use-cases.

**Infrastructure**
- `infrastructure/config.py` — `validatie`-veld uit `VALIDATIE`.
- `infrastructure/db.py` — lazy `get_engine()`/`get_session_factory()`/`reset_engine()`.
- `infrastructure/rabbitmq_consumer.py` — bugfix + netwerkrapportage-binding + `rapport_datum`.
- `infrastructure/main.py` — `get_session_factory()` + beleid doorgeven.
- `infrastructure/models.py` — conditie-kolommen.
- `infrastructure/repositories.py` — conditie mappen.
- `alembic/versions/20260702_0002_kunstwerk_conditie.py` (nieuw).

**Interface**
- `interface/schemas.py` — `KunstwerkResponse` conditie-velden + mapper.

**Tests**
- `tests/test_domain.py`, `tests/test_application.py` — uitbreiden.
- `tests/test_consumer.py` (nieuw) — consumer-unit.
- `tests/integration/{__init__.py,conftest.py,test_postgres.py,test_event_flow.py}` (nieuw).
- `pyproject.toml` — testcontainers-dep + pytest-markers.

**Docs/config**
- `.env.example`, `docker-compose.yml`, `docs/events.md`, `docs/dokploy.md`, `beheer/README.md`, `beheer/CLAUDE.md`.

---

## Task 1: Domein — Conditie + verwerk_onderhoudsrapport

**Files:**
- Modify: `domain/model.py`
- Test: `tests/test_domain.py`

**Interfaces:**
- Produces: `Conditie` (StrEnum: `GOED="Goed"`, `AANDACHT="Aandacht"`, `KRITIEK="Kritiek"`, `ONBEKEND="Onbekend"`); `Kunstwerk.conditie: Conditie`, `Kunstwerk.conditie_bijgewerkt_op: datetime | None`; `Kunstwerk.verwerk_onderhoudsrapport(rapport_datum: date, resultaat: RapportageResultaat, now: datetime) -> None`.

- [ ] **Step 1: Write failing tests** in `tests/test_domain.py`:

```python
from datetime import UTC, date, datetime

from domain.model import (
    Conditie,
    Kunstwerk,
    KunstwerkId,
    KunstwerkType,
    Locatie,
    RapportageResultaat,
)


def _nieuw_kunstwerk() -> Kunstwerk:
    now = datetime(2026, 1, 1, tzinfo=UTC)
    return Kunstwerk.registreer(
        kunstwerk_id=KunstwerkId("KW-1"),
        naam="Brug A",
        type=KunstwerkType.BRUG,
        locatie=Locatie("A12"),
        now=now,
    )


def test_nieuw_kunstwerk_heeft_conditie_onbekend() -> None:
    assert _nieuw_kunstwerk().conditie is Conditie.ONBEKEND


def test_onderhoudsrapport_voldoet_zet_conditie_goed_en_inspectiedatum() -> None:
    kw = _nieuw_kunstwerk()
    now = datetime(2026, 7, 2, tzinfo=UTC)
    kw.verwerk_onderhoudsrapport(date(2026, 7, 1), RapportageResultaat.VOLDOET, now)
    assert kw.conditie is Conditie.GOED
    assert kw.laatste_inspectiedatum == date(2026, 7, 1)
    assert kw.conditie_bijgewerkt_op == now


def test_onderhoudsrapport_voldoet_niet_zet_conditie_kritiek() -> None:
    kw = _nieuw_kunstwerk()
    kw.verwerk_onderhoudsrapport(date(2026, 7, 1), RapportageResultaat.VOLDOET_NIET, datetime(2026, 7, 2, tzinfo=UTC))
    assert kw.conditie is Conditie.KRITIEK


def test_niet_te_beoordelen_behoudt_bestaande_conditie() -> None:
    kw = _nieuw_kunstwerk()
    kw.verwerk_onderhoudsrapport(date(2026, 6, 1), RapportageResultaat.VOLDOET, datetime(2026, 6, 2, tzinfo=UTC))
    kw.verwerk_onderhoudsrapport(date(2026, 7, 1), RapportageResultaat.NIET_TE_BEOORDELEN, datetime(2026, 7, 2, tzinfo=UTC))
    assert kw.conditie is Conditie.GOED  # niet teruggevallen naar Onbekend
    assert kw.laatste_inspectiedatum == date(2026, 7, 1)


def test_oudere_rapportdatum_verlaagt_inspectiedatum_niet() -> None:
    kw = _nieuw_kunstwerk()
    kw.verwerk_onderhoudsrapport(date(2026, 7, 1), RapportageResultaat.VOLDOET, datetime(2026, 7, 2, tzinfo=UTC))
    kw.verwerk_onderhoudsrapport(date(2026, 6, 1), RapportageResultaat.VOLDOET_NIET, datetime(2026, 7, 3, tzinfo=UTC))
    assert kw.laatste_inspectiedatum == date(2026, 7, 1)  # blijft de nieuwste
    assert kw.conditie is Conditie.KRITIEK  # conditie volgt wel het laatste rapport
```

- [ ] **Step 2: Run to verify fail** — `python -m pytest tests/test_domain.py -q` → FAIL (ImportError `Conditie`).

- [ ] **Step 3: Implement** in `domain/model.py`:

Add enum near the other StrEnums:

```python
class Conditie(StrEnum):
    GOED = "Goed"
    AANDACHT = "Aandacht"
    KRITIEK = "Kritiek"
    ONBEKEND = "Onbekend"
```

Add two fields at the end of `Kunstwerk`'s defaulted fields (after `buitengebruik_datum`):

```python
    conditie: Conditie = Conditie.ONBEKEND
    conditie_bijgewerkt_op: datetime | None = None
```

Add method to `Kunstwerk`:

```python
    def verwerk_onderhoudsrapport(
        self,
        rapport_datum: date,
        resultaat: RapportageResultaat,
        now: datetime,
    ) -> None:
        if self.laatste_inspectiedatum is None or rapport_datum >= self.laatste_inspectiedatum:
            self.laatste_inspectiedatum = rapport_datum
        nieuwe_conditie = _conditie_uit_resultaat(resultaat)
        if nieuwe_conditie is not None:
            self.conditie = nieuwe_conditie
        self.conditie_bijgewerkt_op = now
        self.gewijzigd_op = now
```

Add module-level helper (near `_blank_to_none`):

```python
def _conditie_uit_resultaat(resultaat: RapportageResultaat) -> Conditie | None:
    if resultaat == RapportageResultaat.VOLDOET:
        return Conditie.GOED
    if resultaat == RapportageResultaat.VOLDOET_NIET:
        return Conditie.KRITIEK
    return None  # NIET_TE_BEOORDELEN: bestaande conditie behouden
```

- [ ] **Step 4: Run to verify pass** — `python -m pytest tests/test_domain.py -q` → PASS.

- [ ] **Step 5: Commit**

```bash
git add beheer/domain/model.py beheer/tests/test_domain.py
git commit -m "feat(beheer): kunstwerk-conditie + verwerk_onderhoudsrapport (domein)"
```

---

## Task 2: Application — Validatiebeleid, ValidatieError, register-feedback

**Files:**
- Create: `application/validatie.py`
- Modify: `application/errors.py`, `application/dto.py`, `application/use_cases.py`
- Test: `tests/test_application.py`

**Interfaces:**
- Produces: `Validatiebeleid` (StrEnum `SOEPEL="soepel"`, `STRENG="streng"`); `ValidatieError(ApplicationError)`; `VerwerkRapportCommand.rapport_datum: date`; use-case-constructors `VerwerkMonitoringRapport(uow, validator, clock, id_generator, beleid)` en `VerwerkOnderhoudAfgerond(uow, validator, clock, id_generator, beleid)`; beide `__call__` → `RapportageBeoordeling | None`.
- Consumes: `Kunstwerk.verwerk_onderhoudsrapport` (Task 1).

- [ ] **Step 1: Write failing tests** — append to `tests/test_application.py`:

```python
import pytest

from application.errors import ValidatieError
from application.validatie import Validatiebeleid
from domain.model import Conditie, KunstwerkId, KunstwerkStatus
# (RegistreerKunstwerkCommand, StelEisenVastCommand, VerwerkRapportCommand, Eis, EisOperator,
#  StelOnderhoudseisenVast, StelOntwerpeisenVast, VerwerkMonitoringRapport, VerwerkOnderhoudAfgerond,
#  RegistreerKunstwerk, StelKunstwerkBuitenGebruik, EisenValidator, fakes — al geïmporteerd bovenaan)
from datetime import date


def _rapport_command(kunstwerk_id: str, **overrides) -> VerwerkRapportCommand:
    base = dict(
        bron_event_id="evt-x",
        extern_rapport_id="rap-x",
        kunstwerk_id=kunstwerk_id,
        rapportwaarden={"corrosiescore": 8.0},
        event_type="onderhoud.onderhoud.afgerond",
        occurred_at=FixedClock().now(),
        rapport_datum=date(2026, 7, 1),
    )
    base.update(overrides)
    return VerwerkRapportCommand(**base)


def test_streng_weigert_onbekend_kunstwerk() -> None:
    uow, clock, ids = FakeUnitOfWork(), FixedClock(), SequenceIdGenerator()
    use_case = VerwerkOnderhoudAfgerond(uow, EisenValidator(), clock, ids, Validatiebeleid.STRENG)
    with pytest.raises(ValidatieError):
        use_case(_rapport_command("KW-onbekend"))


def test_soepel_slaat_onbekend_kunstwerk_over_en_is_idempotent() -> None:
    uow, clock, ids = FakeUnitOfWork(), FixedClock(), SequenceIdGenerator()
    use_case = VerwerkOnderhoudAfgerond(uow, EisenValidator(), clock, ids, Validatiebeleid.SOEPEL)
    assert use_case(_rapport_command("KW-onbekend")) is None
    assert uow.verwerkte_events.has("evt-x") is True
    assert len(uow.state.beoordelingen) == 0
    assert use_case(_rapport_command("KW-onbekend")) is None  # redelivery: geen fout


def test_streng_weigert_buitengebruikgesteld_kunstwerk() -> None:
    uow, publisher, clock, ids = FakeUnitOfWork(), FakePublisher(), FixedClock(), SequenceIdGenerator()
    kw = RegistreerKunstwerk(uow, publisher, clock, ids)(
        RegistreerKunstwerkCommand("Sluis", KunstwerkType.SLUIS, "IJmuiden", kunstwerk_id="KW-9")
    )
    StelKunstwerkBuitenGebruik(uow, publisher, clock)(
        StelKunstwerkBuitenGebruikCommand("KW-9", reden="sloop", datum=date(2026, 6, 1))
    )
    use_case = VerwerkOnderhoudAfgerond(uow, EisenValidator(), clock, ids, Validatiebeleid.STRENG)
    with pytest.raises(ValidatieError):
        use_case(_rapport_command("KW-9"))


def test_onderhoudsrapport_werkt_register_bij() -> None:
    uow, publisher, clock, ids = FakeUnitOfWork(), FakePublisher(), FixedClock(), SequenceIdGenerator()
    kw = RegistreerKunstwerk(uow, publisher, clock, ids)(
        RegistreerKunstwerkCommand("Gemaal", KunstwerkType.GEMAAL, "Zeeland", kunstwerk_id="KW-7")
    )
    StelOnderhoudseisenVast(uow, publisher, clock, ids)(
        StelEisenVastCommand("KW-7", eisen=[Eis("CORR", "Corrosie", "corrosiescore", EisOperator.GROTER_OF_GELIJK, 7.0, "score")])
    )
    VerwerkOnderhoudAfgerond(uow, EisenValidator(), clock, ids, Validatiebeleid.STRENG)(
        _rapport_command("KW-7", bron_event_id="evt-7", rapportwaarden={"corrosiescore": 9.0})
    )
    bijgewerkt = uow.kunstwerken.get(KunstwerkId("KW-7"))
    assert bijgewerkt.conditie is Conditie.GOED
    assert bijgewerkt.laatste_inspectiedatum == date(2026, 7, 1)


def test_netwerkrapportage_raakt_register_niet_aan() -> None:
    uow, publisher, clock, ids = FakeUnitOfWork(), FakePublisher(), FixedClock(), SequenceIdGenerator()
    RegistreerKunstwerk(uow, publisher, clock, ids)(
        RegistreerKunstwerkCommand("Tunnel", KunstwerkType.TUNNEL, "A2", kunstwerk_id="KW-3")
    )
    StelOntwerpeisenVast(uow, publisher, clock, ids)(
        StelEisenVastCommand("KW-3", eisen=[Eis("TRIL", "Trilling", "trilling", EisOperator.KLEINER_OF_GELIJK, 5.0, "mm/s")])
    )
    VerwerkMonitoringRapport(uow, EisenValidator(), clock, ids, Validatiebeleid.STRENG)(
        _rapport_command("KW-3", bron_event_id="evt-3", event_type="monitoring.netwerkrapportage.opgesteld", rapportwaarden={"trilling": 3.0})
    )
    kw = uow.kunstwerken.get(KunstwerkId("KW-3"))
    assert kw.conditie is Conditie.ONBEKEND  # netwerkrapportage muteert het register niet
```

Also update the two existing rapport-tests to pass `Validatiebeleid.STRENG` (or `.SOEPEL`) as the 5th constructor arg and add `rapport_datum=date(...)` to their `VerwerkRapportCommand(...)`. And add `StelKunstwerkBuitenGebruikCommand` / `KunstwerkType` / `Eis` / `EisOperator` / `RegistreerKunstwerkCommand` to the import block if missing.

- [ ] **Step 2: Run to verify fail** — `python -m pytest tests/test_application.py -q` → FAIL (ImportError / signature).

- [ ] **Step 3: Implement**

`application/validatie.py` (new):

```python
from __future__ import annotations

from enum import StrEnum


class Validatiebeleid(StrEnum):
    SOEPEL = "soepel"
    STRENG = "streng"
```

`application/errors.py` — append:

```python
class ValidatieError(ApplicationError):
    """Raised when a strict validation rejects an incoming reference."""
```

`application/dto.py` — add to `VerwerkRapportCommand`:

```python
    rapport_datum: date
```

(`date` is already imported.)

`application/use_cases.py` — imports:

```python
from datetime import date  # if not present
import logging
from domain.model import Conditie, KunstwerkStatus  # extend existing model import
from application.errors import ConflictError, NotFoundError, ValidatieError
from application.validatie import Validatiebeleid

logger = logging.getLogger(__name__)
```

Rewrite `VerwerkMonitoringRapport` / `VerwerkOnderhoudAfgerond` to accept `beleid` and pass `update_register`:

```python
class VerwerkMonitoringRapport:
    def __init__(self, uow, validator, clock, id_generator, beleid: Validatiebeleid) -> None:
        self.uow, self.validator, self.clock, self.id_generator, self.beleid = (
            uow, validator, clock, id_generator, beleid,
        )

    def __call__(self, command: VerwerkRapportCommand) -> RapportageBeoordeling | None:
        return _verwerk_rapport(
            command=command, rapportage_type=RapportageType.NETWERKRAPPORTAGE,
            eisen_soort=EisenSoort.ONTWERPEISEN, uow=self.uow, validator=self.validator,
            clock=self.clock, id_generator=self.id_generator, beleid=self.beleid,
            update_register=False,
        )


class VerwerkOnderhoudAfgerond:
    def __init__(self, uow, validator, clock, id_generator, beleid: Validatiebeleid) -> None:
        self.uow, self.validator, self.clock, self.id_generator, self.beleid = (
            uow, validator, clock, id_generator, beleid,
        )

    def __call__(self, command: VerwerkRapportCommand) -> RapportageBeoordeling | None:
        return _verwerk_rapport(
            command=command, rapportage_type=RapportageType.ONDERHOUDSRAPPORT,
            eisen_soort=EisenSoort.ONDERHOUDSEISEN, uow=self.uow, validator=self.validator,
            clock=self.clock, id_generator=self.id_generator, beleid=self.beleid,
            update_register=True,
        )
```

Rewrite `_verwerk_rapport`:

```python
def _verwerk_rapport(
    command, rapportage_type, eisen_soort, uow, validator, clock, id_generator,
    beleid: Validatiebeleid, update_register: bool,
) -> RapportageBeoordeling | None:
    now = clock.now()
    kunstwerk_id = KunstwerkId(command.kunstwerk_id)
    with uow:
        bestaand = uow.beoordelingen.get_by_bron_event_id(command.bron_event_id)
        if bestaand is not None:
            return bestaand
        if uow.verwerkte_events.has(command.bron_event_id):
            return uow.beoordelingen.get_by_bron_event_id(command.bron_event_id)

        kunstwerk = uow.kunstwerken.get(kunstwerk_id)
        if kunstwerk is None:
            if beleid is Validatiebeleid.STRENG:
                raise ValidatieError(f"Onbekend kunstwerk '{kunstwerk_id}' geweigerd (streng)")
            logger.warning("Rapport voor onbekend kunstwerk '%s' overgeslagen (soepel)", kunstwerk_id)
            uow.verwerkte_events.add(
                event_id=command.bron_event_id, event_type=command.event_type,
                occurred_at=command.occurred_at, processed_at=now,
            )
            uow.commit()
            return None
        if kunstwerk.status == KunstwerkStatus.BUITEN_GEBRUIK and beleid is Validatiebeleid.STRENG:
            raise ValidatieError(f"Kunstwerk '{kunstwerk_id}' is buiten gebruik; rapport geweigerd (streng)")

        eisenpakket = uow.eisenpakketten.get_current(kunstwerk_id, eisen_soort)
        resultaat, bevindingen = validator.beoordeel(eisenpakket, command.rapportwaarden)
        beoordeling = RapportageBeoordeling.registreer(
            beoordeling_id=id_generator.new_id(), extern_rapport_id=command.extern_rapport_id,
            bron_event_id=command.bron_event_id, kunstwerk_id=kunstwerk_id,
            rapportage_type=rapportage_type, ontvangen_op=command.occurred_at,
            eisenpakket_id=eisenpakket.eisenpakket_id if eisenpakket else None,
            resultaat=resultaat, bevindingen=bevindingen, now=now,
        )
        uow.beoordelingen.add(beoordeling)
        if update_register:
            kunstwerk.verwerk_onderhoudsrapport(command.rapport_datum, resultaat, now)
            uow.kunstwerken.save(kunstwerk)
        uow.verwerkte_events.add(
            event_id=command.bron_event_id, event_type=command.event_type,
            occurred_at=command.occurred_at, processed_at=now,
        )
        uow.commit()
        return beoordeling
```

- [ ] **Step 4: Run to verify pass** — `python -m pytest tests/test_application.py -q` → PASS.

- [ ] **Step 5: Commit**

```bash
git add beheer/application beheer/tests/test_application.py
git commit -m "feat(beheer): soepel/streng-validatie + onderhoudsrapport terug in register"
```

---

## Task 3: Config — VALIDATIE-vlag

**Files:**
- Modify: `infrastructure/config.py`
- Test: `tests/test_config.py` (nieuw)

**Interfaces:**
- Produces: `Settings.validatie: str` (`"soepel"`/`"streng"`).

- [ ] **Step 1: Write failing tests** in `tests/test_config.py`:

```python
from __future__ import annotations

from infrastructure.config import get_settings


def test_validatie_default_is_soepel(monkeypatch) -> None:
    monkeypatch.delenv("VALIDATIE", raising=False)
    assert get_settings().validatie == "soepel"


def test_validatie_streng_uit_env(monkeypatch) -> None:
    monkeypatch.setenv("VALIDATIE", "STRENG")
    assert get_settings().validatie == "streng"


def test_onbekende_validatie_valt_terug_op_soepel(monkeypatch) -> None:
    monkeypatch.setenv("VALIDATIE", "banaan")
    assert get_settings().validatie == "soepel"
```

- [ ] **Step 2: Run to verify fail** — `python -m pytest tests/test_config.py -q` → FAIL.

- [ ] **Step 3: Implement** — add field to `Settings` and parsing in `get_settings`:

```python
    validatie: str = "soepel"
```

```python
    raw_validatie = os.getenv("VALIDATIE", "soepel").strip().lower()
    validatie = raw_validatie if raw_validatie in {"soepel", "streng"} else "soepel"
    return Settings(
        ...,
        validatie=validatie,
    )
```

- [ ] **Step 4: Run to verify pass** — PASS.

- [ ] **Step 5: Commit**

```bash
git add beheer/infrastructure/config.py beheer/tests/test_config.py
git commit -m "feat(beheer): VALIDATIE-env (soepel|streng, default soepel)"
```

---

## Task 4: Consumer — bugfix, netwerkrapportage-binding, rapport_datum

**Files:**
- Modify: `infrastructure/rabbitmq_consumer.py`
- Test: `tests/test_consumer.py` (nieuw)

**Interfaces:**
- Consumes: `VerwerkRapportCommand.rapport_datum` (Task 2).
- Produces: `_extract_numeric_values(source) -> dict[str, float]`; `_command_from_envelope(envelope, external_id_fields, values_fields) -> VerwerkRapportCommand`; consumer bindt `monitoring.netwerkrapportage.opgesteld` (queue `beheer.monitoring_netwerkrapportage`) en `onderhoud.onderhoud.afgerond` (queue `beheer.onderhoud_afgerond`).

- [ ] **Step 1: Write failing tests** in `tests/test_consumer.py`:

```python
from __future__ import annotations

from datetime import date

from infrastructure.rabbitmq_consumer import _command_from_envelope, _extract_numeric_values


def test_extract_numeric_values_uit_dict() -> None:
    assert _extract_numeric_values({"trilling": 3, "spoor": 8.5}) == {"trilling": 3.0, "spoor": 8.5}


def test_extract_numeric_values_uit_lijst_verwerkt_alle_items() -> None:
    bron = [
        {"meetwaarde": "trilling", "waarde": 3.2},
        {"code": "SPOOR", "waarde": 8},
        {"naam": "scheefstand", "value": 1.1},
    ]
    assert _extract_numeric_values(bron) == {"trilling": 3.2, "SPOOR": 8.0, "scheefstand": 1.1}


def test_command_from_envelope_leest_rapport_datum() -> None:
    envelope = {
        "eventId": "evt-1",
        "eventType": "onderhoud.onderhoud.afgerond",
        "occurredAt": "2026-07-02T10:00:00Z",
        "data": {"kunstwerkId": "KW-1", "onderhoudId": "OH-1", "datum": "2026-07-01",
                 "resultaat": {"corrosiescore": 9.0}},
    }
    command = _command_from_envelope(envelope, ("rapportId", "onderhoudId"), ("rapportwaarden", "resultaat"))
    assert command.kunstwerk_id == "KW-1"
    assert command.rapport_datum == date(2026, 7, 1)
    assert command.rapportwaarden == {"corrosiescore": 9.0}


def test_command_from_envelope_valt_terug_op_occurred_at() -> None:
    envelope = {
        "eventId": "evt-2", "eventType": "monitoring.netwerkrapportage.opgesteld",
        "occurredAt": "2026-07-02T10:00:00Z",
        "data": {"kunstwerkId": "KW-2", "resultaten": {"trilling": 3.0}},
    }
    command = _command_from_envelope(envelope, ("rapportId",), ("resultaten", "metingen"))
    assert command.rapport_datum == date(2026, 7, 2)
```

- [ ] **Step 2: Run to verify fail** — `python -m pytest tests/test_consumer.py -q` → FAIL (import error: module currently has an IndentationError).

- [ ] **Step 3: Implement**

Fix `_extract_numeric_values` (correct list-branch indentation + iterate all items):

```python
def _extract_numeric_values(source: Any) -> dict[str, float]:
    values: dict[str, float] = {}
    if isinstance(source, dict):
        for key, value in source.items():
            if isinstance(value, (int, float)):
                values[str(key)] = float(value)
            elif isinstance(value, dict):
                name = value.get("meetwaarde") or value.get("code") or key
                numeric = value.get("waarde", value.get("value"))
                if isinstance(numeric, (int, float)):
                    values[str(name)] = float(numeric)
    elif isinstance(source, list):
        for item in source:
            if not isinstance(item, dict):
                continue
            name = item.get("meetwaarde") or item.get("code") or item.get("naam")
            numeric = item.get("waarde", item.get("value"))
            if name and isinstance(numeric, (int, float)):
                values[str(name)] = float(numeric)
    return values
```

Add `_parse_date` and use it in `_command_from_envelope`:

```python
def _parse_date(value: Any) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None
```

```python
def _command_from_envelope(envelope, external_id_fields, values_fields) -> VerwerkRapportCommand:
    data = envelope.get("data") or {}
    external_id = _first_present(data, external_id_fields) or envelope["eventId"]
    values_source = _first_present(data, values_fields)
    occurred_at = _parse_datetime(envelope["occurredAt"])
    rapport_datum = _parse_date(data.get("datum")) or occurred_at.date()
    return VerwerkRapportCommand(
        bron_event_id=envelope["eventId"], extern_rapport_id=str(external_id),
        kunstwerk_id=str(data["kunstwerkId"]), rapportwaarden=_extract_numeric_values(values_source),
        event_type=envelope["eventType"], occurred_at=occurred_at, rapport_datum=rapport_datum,
    )
```

Add `date` to the `datetime` import line: `from datetime import UTC, date, datetime`.

Change the netwerkrapportage binding in `start()`:

```python
    def start(self) -> None:
        self._start_consumer(
            queue_name="beheer.monitoring_netwerkrapportage",
            routing_key="monitoring.netwerkrapportage.opgesteld",
            handler_factory=self.monitoring_factory,
            external_id_fields=("rapportId", "netwerkrapportageId"),
            values_fields=("resultaten", "metingen"),
        )
        self._start_consumer(
            queue_name="beheer.onderhoud_afgerond",
            routing_key="onderhoud.onderhoud.afgerond",
            handler_factory=self.onderhoud_factory,
            external_id_fields=("rapportId", "onderhoudId"),
            values_fields=("resultaat", "rapportwaarden"),
        )
```

(No beleid change needed in the consumer: `main.py` bakes `beleid` into the factories; a `ValidatieError` is an exception → the existing `except Exception` nacks with `requeue=False`; a soepel `None` return does not raise → the message is acked.)

- [ ] **Step 4: Run to verify pass** — `python -m pytest tests/test_consumer.py -q` → PASS.

- [ ] **Step 5: Commit**

```bash
git add beheer/infrastructure/rabbitmq_consumer.py beheer/tests/test_consumer.py
git commit -m "fix(beheer): consumer numeric-parse-bug + netwerkrapportage-binding + rapport_datum"
```

---

## Task 5: db.py lazy engine + main.py wiring

**Files:**
- Modify: `infrastructure/db.py`, `infrastructure/main.py`
- Test: `tests/test_db.py` (nieuw)

**Interfaces:**
- Produces: `get_engine()`, `get_session_factory() -> sessionmaker`, `reset_engine()`, `check_database()`, `Base` (unchanged).
- Consumes: `Validatiebeleid` (Task 2), `Settings.validatie` (Task 3), `get_session_factory` in `main.py`.

- [ ] **Step 1: Write failing test** in `tests/test_db.py`:

```python
from __future__ import annotations

import infrastructure.db as db


def test_session_factory_leest_env_op_gebruiksmoment(monkeypatch) -> None:
    db.reset_engine()
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://u:p@localhost:5432/beheer_test")
    factory = db.get_session_factory()
    assert str(db.get_engine().url).endswith("/beheer_test")
    db.reset_engine()


def test_create_app_bouwt_zonder_db_of_broker(monkeypatch) -> None:
    from infrastructure.main import create_app  # import mag geen engine/broker aanraken
    app = create_app()
    assert any(route.path == "/health" for route in app.routes)
```

- [ ] **Step 2: Run to verify fail** — `python -m pytest tests/test_db.py -q` → FAIL (`reset_engine`/`get_session_factory` missing).

- [ ] **Step 3: Implement** — rewrite `infrastructure/db.py`:

```python
from __future__ import annotations

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from infrastructure.config import get_settings, sqlalchemy_url


class Base(DeclarativeBase):
    pass


_engine: Engine | None = None
_session_factory: sessionmaker | None = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = create_engine(sqlalchemy_url(get_settings().database_url), pool_pre_ping=True)
    return _engine


def get_session_factory() -> sessionmaker:
    global _session_factory
    if _session_factory is None:
        _session_factory = sessionmaker(bind=get_engine(), expire_on_commit=False)
    return _session_factory


def reset_engine() -> None:
    global _engine, _session_factory
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _session_factory = None


def check_database() -> bool:
    with get_engine().connect() as connection:
        connection.execute(text("select 1"))
    return True
```

Update `infrastructure/main.py`:
- Import: `from infrastructure.db import check_database, get_session_factory` and `from application.validatie import Validatiebeleid`.
- Change `uow()`:

```python
    def uow() -> SqlAlchemyUnitOfWork:
        return SqlAlchemyUnitOfWork(get_session_factory())
```

- Compute beleid and pass it:

```python
    beleid = Validatiebeleid(settings.validatie)

    def verwerk_monitoring_rapport() -> VerwerkMonitoringRapport:
        return VerwerkMonitoringRapport(uow(), EisenValidator(), clock, id_generator, beleid)

    def verwerk_onderhoud_afgerond() -> VerwerkOnderhoudAfgerond:
        return VerwerkOnderhoudAfgerond(uow(), EisenValidator(), clock, id_generator, beleid)
```

- [ ] **Step 4: Run to verify pass** — `python -m pytest tests/test_db.py -q` → PASS. Then full unit run: `python -m pytest -q` → PASS.

- [ ] **Step 5: Commit**

```bash
git add beheer/infrastructure/db.py beheer/infrastructure/main.py beheer/tests/test_db.py
git commit -m "refactor(beheer): lazy engine/session + beleid-wiring in de compositieroot"
```

---

## Task 6: Persistentie — conditie-kolommen, migratie, mapping, response

**Files:**
- Modify: `infrastructure/models.py`, `infrastructure/repositories.py`, `interface/schemas.py`
- Create: `alembic/versions/20260702_0002_kunstwerk_conditie.py`
- Test: `tests/test_schema_mapping.py` (nieuw)

**Interfaces:**
- Consumes: `Conditie`, `Kunstwerk.conditie`/`conditie_bijgewerkt_op` (Task 1).
- Produces: `KunstwerkModel.conditie`/`conditie_bijgewerkt_op`; `KunstwerkResponse.conditie: str`, `KunstwerkResponse.conditieBijgewerktOp: datetime | None`; migratie-revisie `20260702_0002` (down_revision `20260701_0001`).

- [ ] **Step 1: Write failing test** in `tests/test_schema_mapping.py`:

```python
from __future__ import annotations

from datetime import UTC, datetime

from domain.model import Conditie, Kunstwerk, KunstwerkId, KunstwerkType, Locatie
from interface.schemas import kunstwerk_response


def test_kunstwerk_response_bevat_conditie() -> None:
    kw = Kunstwerk.registreer(KunstwerkId("KW-1"), "Brug", KunstwerkType.BRUG, Locatie("A12"), datetime(2026, 1, 1, tzinfo=UTC))
    resp = kunstwerk_response(kw)
    assert resp.conditie == Conditie.ONBEKEND.value
    assert resp.conditieBijgewerktOp is None
```

- [ ] **Step 2: Run to verify fail** — FAIL (`conditie` not on response).

- [ ] **Step 3: Implement**

`infrastructure/models.py` — add to `KunstwerkModel` (imports: add `String` already imported):

```python
    conditie: Mapped[str] = mapped_column(String(40), nullable=False, server_default="Onbekend")
    conditie_bijgewerkt_op: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
```

`infrastructure/repositories.py`:
- Import `Conditie` in the `domain.model` import block.
- In `_update_kunstwerk_model`, add:

```python
    model.conditie = kunstwerk.conditie.value
    model.conditie_bijgewerkt_op = kunstwerk.conditie_bijgewerkt_op
```

- In `_model_to_kunstwerk`, add to the constructor:

```python
        conditie=Conditie(model.conditie),
        conditie_bijgewerkt_op=model.conditie_bijgewerkt_op,
```

`interface/schemas.py`:
- `KunstwerkResponse` — add:

```python
    conditie: str
    conditieBijgewerktOp: datetime | None
```

- `kunstwerk_response(...)` — add:

```python
        conditie=kunstwerk.conditie.value,
        conditieBijgewerktOp=kunstwerk.conditie_bijgewerkt_op,
```

`alembic/versions/20260702_0002_kunstwerk_conditie.py` (new):

```python
"""kunstwerk conditie

Revision ID: 20260702_0002
Revises: 20260701_0001
Create Date: 2026-07-02
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260702_0002"
down_revision: str | None = "20260701_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "kunstwerk",
        sa.Column("conditie", sa.String(length=40), nullable=False, server_default="Onbekend"),
    )
    op.add_column(
        "kunstwerk",
        sa.Column("conditie_bijgewerkt_op", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("kunstwerk", "conditie_bijgewerkt_op")
    op.drop_column("kunstwerk", "conditie")
```

- [ ] **Step 4: Run to verify pass** — `python -m pytest tests/test_schema_mapping.py -q` → PASS. Full unit: `python -m pytest -q` → PASS.

- [ ] **Step 5: Commit**

```bash
git add beheer/infrastructure/models.py beheer/infrastructure/repositories.py beheer/interface/schemas.py beheer/alembic/versions/20260702_0002_kunstwerk_conditie.py beheer/tests/test_schema_mapping.py
git commit -m "feat(beheer): conditie-persistentie (model, migratie, mapping, API-response)"
```

---

## Task 7: Integratietests (Testcontainers: Postgres + RabbitMQ)

**Files:**
- Modify: `pyproject.toml`
- Create: `tests/integration/__init__.py`, `tests/integration/conftest.py`, `tests/integration/test_postgres.py`, `tests/integration/test_event_flow.py`

**Interfaces:**
- Consumes: `get_session_factory`/`reset_engine` (Task 5), Alembic migraties (Task 6), use-cases + consumer (Tasks 2/4).

- [ ] **Step 1: `pyproject.toml`** — add dev deps + pytest markers:

```toml
[project.optional-dependencies]
dev = [
  "httpx>=0.27.0",
  "pytest>=8.3.2",
  "testcontainers[postgres,rabbitmq]>=4.5.0",
]
```

```toml
[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]
addopts = "-q -m 'not integration'"
markers = [
  "integration: integratietests die Docker (Testcontainers) vereisen",
]
```

Install: from `beheer/`, `python -m pip install -e ".[dev]"`.

- [ ] **Step 2: `tests/integration/__init__.py`** — empty file.

- [ ] **Step 3: `tests/integration/conftest.py`**:

```python
from __future__ import annotations

import os

import pytest
from alembic import command
from alembic.config import Config
from testcontainers.postgres import PostgresContainer
from testcontainers.rabbitmq import RabbitMqContainer

pytestmark = pytest.mark.integration


@pytest.fixture(scope="session")
def database_url() -> str:
    with PostgresContainer("postgres:16", driver="psycopg") as pg:
        yield pg.get_connection_url()


@pytest.fixture(scope="session")
def rabbitmq_url() -> str:
    with RabbitMqContainer("rabbitmq:3-management") as rabbit:
        params = rabbit.get_connection_params()
        creds = getattr(params, "credentials", None)
        user = getattr(creds, "username", "guest")
        pw = getattr(creds, "password", "guest")
        yield f"amqp://{user}:{pw}@{params.host}:{params.port}/"


@pytest.fixture()
def migrated_db(database_url, monkeypatch):
    import infrastructure.db as db

    monkeypatch.setenv("DATABASE_URL", database_url)
    db.reset_engine()
    cfg = Config("alembic.ini")
    command.upgrade(cfg, "head")
    yield database_url
    db.reset_engine()
```

Every integration test file starts with `pytestmark = pytest.mark.integration`.

- [ ] **Step 4: `tests/integration/test_postgres.py`** — persistentie + idempotentie via de UoW:

```python
from __future__ import annotations

from datetime import UTC, date, datetime

import pytest

from application.dto import RegistreerKunstwerkCommand, StelEisenVastCommand, VerwerkRapportCommand
from application.use_cases import (
    RegistreerKunstwerk,
    StelOnderhoudseisenVast,
    VerwerkOnderhoudAfgerond,
)
from application.validatie import Validatiebeleid
from domain.model import Conditie, Eis, EisOperator, KunstwerkId, KunstwerkType
from domain.services import EisenValidator
from infrastructure.db import get_session_factory
from infrastructure.runtime import SystemClock, UuidGenerator
from infrastructure.uow import SqlAlchemyUnitOfWork

pytestmark = pytest.mark.integration


class _NullPublisher:
    def publish(self, events) -> None:  # noqa: D401
        return None


def _uow():
    return SqlAlchemyUnitOfWork(get_session_factory())


def test_onderhoudsrapport_persisteert_en_is_idempotent(migrated_db) -> None:
    clock, ids, pub = SystemClock(), UuidGenerator(), _NullPublisher()
    RegistreerKunstwerk(_uow(), pub, clock, ids)(
        RegistreerKunstwerkCommand("Gemaal", KunstwerkType.GEMAAL, "Zeeland", kunstwerk_id="KW-INT-1")
    )
    StelOnderhoudseisenVast(_uow(), pub, clock, ids)(
        StelEisenVastCommand("KW-INT-1", eisen=[Eis("CORR", "Corrosie", "corrosiescore", EisOperator.GROTER_OF_GELIJK, 7.0, "score")])
    )
    command = VerwerkRapportCommand(
        bron_event_id="evt-int-1", extern_rapport_id="rap-1", kunstwerk_id="KW-INT-1",
        rapportwaarden={"corrosiescore": 9.0}, event_type="onderhoud.onderhoud.afgerond",
        occurred_at=datetime(2026, 7, 2, tzinfo=UTC), rapport_datum=date(2026, 7, 1),
    )
    use_case = VerwerkOnderhoudAfgerond(_uow(), EisenValidator(), clock, ids, Validatiebeleid.STRENG)
    eerste = use_case(command)
    tweede = use_case(command)  # zelfde bron_event_id → idempotent

    assert eerste.beoordeling_id == tweede.beoordeling_id
    with _uow() as uow:
        kw = uow.kunstwerken.get(KunstwerkId("KW-INT-1"))
        assert kw.conditie is Conditie.GOED
        assert kw.laatste_inspectiedatum == date(2026, 7, 1)
        assert len(uow.beoordelingen.list(KunstwerkId("KW-INT-1"))) == 1
```

- [ ] **Step 5: `tests/integration/test_event_flow.py`** — end-to-end via echte RabbitMQ:

```python
from __future__ import annotations

import json
import time
from datetime import UTC, datetime

import pika
import pytest

from application.dto import RegistreerKunstwerkCommand, StelEisenVastCommand
from application.use_cases import RegistreerKunstwerk, StelOnderhoudseisenVast, VerwerkMonitoringRapport, VerwerkOnderhoudAfgerond
from application.validatie import Validatiebeleid
from domain.model import Conditie, Eis, EisOperator, KunstwerkId, KunstwerkType
from domain.services import EisenValidator
from infrastructure.db import get_session_factory
from infrastructure.rabbitmq_consumer import RabbitMqConsumerRunner
from infrastructure.runtime import SystemClock, UuidGenerator
from infrastructure.uow import SqlAlchemyUnitOfWork

pytestmark = pytest.mark.integration


class _NullPublisher:
    def publish(self, events) -> None:
        return None


def _uow():
    return SqlAlchemyUnitOfWork(get_session_factory())


def _publish(url: str, routing_key: str, envelope: dict) -> None:
    conn = pika.BlockingConnection(pika.URLParameters(url))
    try:
        ch = conn.channel()
        ch.exchange_declare(exchange="rws.events", exchange_type="topic", durable=True)
        ch.basic_publish("rws.events", routing_key, json.dumps(envelope).encode("utf-8"),
                         pika.BasicProperties(content_type="application/json", delivery_mode=2))
    finally:
        conn.close()


def _wait_for(fn, timeout=20.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        result = fn()
        if result:
            return result
        time.sleep(0.5)
    return None


def test_events_stromen_van_broker_naar_register(migrated_db, rabbitmq_url) -> None:
    clock, ids, pub = SystemClock(), UuidGenerator(), _NullPublisher()
    RegistreerKunstwerk(_uow(), pub, clock, ids)(
        RegistreerKunstwerkCommand("Brug", KunstwerkType.BRUG, "A12", kunstwerk_id="KW-E2E")
    )
    StelOnderhoudseisenVast(_uow(), pub, clock, ids)(
        StelEisenVastCommand("KW-E2E", eisen=[Eis("CORR", "Corrosie", "corrosiescore", EisOperator.GROTER_OF_GELIJK, 7.0, "score")])
    )

    runner = RabbitMqConsumerRunner(
        rabbitmq_url=rabbitmq_url, exchange="rws.events",
        monitoring_factory=lambda: VerwerkMonitoringRapport(_uow(), EisenValidator(), clock, ids, Validatiebeleid.SOEPEL),
        onderhoud_factory=lambda: VerwerkOnderhoudAfgerond(_uow(), EisenValidator(), clock, ids, Validatiebeleid.SOEPEL),
    )
    runner.start()
    time.sleep(2.0)  # queues gebonden

    _publish(rabbitmq_url, "onderhoud.onderhoud.afgerond", {
        "eventId": "evt-e2e-1", "eventType": "onderhoud.onderhoud.afgerond",
        "occurredAt": "2026-07-02T10:00:00Z", "producer": "onderhoud", "version": 1,
        "data": {"kunstwerkId": "KW-E2E", "onderhoudId": "OH-1", "datum": "2026-07-01",
                 "resultaat": {"corrosiescore": 9.0}},
    })

    def _beoordeling():
        with _uow() as uow:
            items = uow.beoordelingen.list(KunstwerkId("KW-E2E"))
            return items[0] if items else None

    assert _wait_for(_beoordeling) is not None
    with _uow() as uow:
        kw = uow.kunstwerken.get(KunstwerkId("KW-E2E"))
        assert kw.conditie is Conditie.GOED
```

- [ ] **Step 6: Run** — from `beheer/`: `python -m pip install -e ".[dev]"` then `python -m pytest -m integration -q` → PASS (Docker required). Confirm the exact Testcontainers API (`PostgresContainer(driver=...)`, `RabbitMqContainer.get_connection_params()`); adjust the fixtures if the installed version differs.

- [ ] **Step 7: Commit**

```bash
git add beheer/pyproject.toml beheer/tests/integration
git commit -m "test(beheer): Testcontainers-integratietests (Postgres + RabbitMQ event-flow)"
```

---

## Task 8: Docs, env & compose

**Files:**
- Modify: `.env.example`, `docker-compose.yml`, `docs/events.md`, `docs/dokploy.md`, `beheer/README.md`, `beheer/CLAUDE.md`

- [ ] **Step 1: `beheer/.env.example`** — add `VALIDATIE=streng` (Fase 2-posture).

- [ ] **Step 2: `docker-compose.yml`** — add to the `beheer` block an explicit `environment: [VALIDATIE=streng]` note (of documenteer dat het via `env_file` uit `.env` komt). Since compose uses `env_file: ./beheer/.env`, `.env.example` + `.env` already carry it; add a comment above the beheer block noting `VALIDATIE`.

- [ ] **Step 3: `docs/events.md`** — add a catalog row and a note:

```
| `monitoring.netwerkrapportage.opgesteld` | Monitoring | `kunstwerkId`, `periode`, `resultaten` (map meetwaarde→waarde) |
```

Add under the bullet list: "`monitoring.netwerkrapportage.opgesteld` levert de periodieke netwerkrapportage aan Beheer (customer/supplier); Beheer valideert die tegen de ontwerpeisen. Afgestemd met de Monitoring-eigenaar."

- [ ] **Step 4: `docs/dokploy.md`** — where beheer env-vars are listed, add `VALIDATIE`.

- [ ] **Step 5: `beheer/README.md`** — update: consumeert `monitoring.netwerkrapportage.opgesteld` (i.p.v. `monitoring.rapport.opgesteld`); document the `VALIDATIE`-flag, `conditie`, and the integration-test commands; add a Status line (Fase 1 af, Fase 2 af).

- [ ] **Step 6: `beheer/CLAUDE.md`** — update the **Consumeert** line to `monitoring.netwerkrapportage.opgesteld`, `onderhoud.onderhoud.afgerond`; add a one-line note about `VALIDATIE` + conditie.

- [ ] **Step 7: Commit**

```bash
git add beheer/.env.example docker-compose.yml docs/events.md docs/dokploy.md beheer/README.md beheer/CLAUDE.md
git commit -m "docs(beheer): netwerkrapportage-event, VALIDATIE-posture, conditie + integratietests"
```

---

## Task 9: Build & verificatie (docker compose)

- [ ] **Step 1:** From `beheer/`, create `.env` from `.env.example` (met `VALIDATIE=streng`).
- [ ] **Step 2:** From repo-root: `docker compose up --build -d beheer postgres rabbitmq`.
- [ ] **Step 3:** `curl -s localhost:8004/health` → `{"service":"ok","database":"ok","broker":"ok"}` (200). Check `docker logs rws-beheer` — consumers gestart, geen IndentationError.
- [ ] **Step 4:** Publiceer een test-`onderhoud.onderhoud.afgerond` (via RabbitMQ management UI of pika-scriptje) voor een geregistreerd kunstwerk; verifieer met `GET /api/kunstwerken/{id}` dat `conditie` + `laatsteInspectiedatum` zijn bijgewerkt en met `GET /api/rapportage-beoordelingen` dat de beoordeling bestaat.
- [ ] **Step 5:** `docker compose down`. Geen commit (verificatiestap).

---

## Self-Review (uitgevoerd door de plan-auteur)

- **Spec-dekking:** netwerkrapportage-event (T4/T8) · onderhoudsrapport→register/conditie (T1/T2/T6) · soepel/streng (T2/T3/T5) · consumer-bugfix (T4) · lazy db + wiring (T5) · integratietests Postgres+RabbitMQ (T7) · docs/env/compose (T8) · build-verificatie (T9). Alle spec-onderdelen gedekt.
- **Placeholders:** geen TBD/TODO; alle code-stappen bevatten concrete code.
- **Type-consistentie:** `Validatiebeleid`, `ValidatieError`, `VerwerkRapportCommand.rapport_datum`, `verwerk_onderhoudsrapport`, `Conditie`, `get_session_factory`/`reset_engine` consistent gebruikt over de taken. Consumer nackt op `ValidatieError` via bestaande `except Exception`; soepel `None` → ack.
- **Aandachtspunt build:** exacte Testcontainers-API in T7 verifiëren bij `pip install`.
