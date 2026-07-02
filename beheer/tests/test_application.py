from __future__ import annotations

from datetime import date
from uuid import uuid4

import pytest

from application.dto import (
    RegistreerKunstwerkCommand,
    StelEisenVastCommand,
    StelKunstwerkBuitenGebruikCommand,
    VerwerkRapportCommand,
)
from application.use_cases import (
    RegistreerKunstwerk,
    StelKunstwerkBuitenGebruik,
    StelOnderhoudseisenVast,
    StelOntwerpeisenVast,
    VerwerkOnderhoudAfgerond,
    VerwerkMonitoringRapport,
)
from domain.model import (
    Eis,
    EisOperator,
    EisenpakketStatus,
    KunstwerkStatus,
    KunstwerkType,
    RapportageResultaat,
)
from domain.services import EisenValidator
from infrastructure.rabbitmq_consumer import (
    monitoring_rapport_command_from_envelope,
    onderhoud_afgerond_command_from_envelope,
)
from tests.fakes import FakePublisher, FakeUnitOfWork, FixedClock, SequenceIdGenerator


pytestmark = pytest.mark.unit


def test_registreer_kunstwerk_slaat_op_en_publiceert_event() -> None:
    uow = FakeUnitOfWork()
    publisher = FakePublisher()
    clock = FixedClock()
    ids = SequenceIdGenerator()

    result = RegistreerKunstwerk(uow, publisher, clock, ids)(
        RegistreerKunstwerkCommand(
            naam="Brug A",
            type=KunstwerkType.BRUG,
            locatie="A12 km 4",
        )
    )

    assert str(result.kunstwerk_id) == "id-1"
    assert uow.committed is True
    assert publisher.events[0].event_type == "beheer.kunstwerk.geregistreerd"


def test_buiten_gebruik_publiceert_event() -> None:
    uow = FakeUnitOfWork()
    publisher = FakePublisher()
    clock = FixedClock()
    ids = SequenceIdGenerator()
    registreer = RegistreerKunstwerk(uow, publisher, clock, ids)
    kunstwerk = registreer(
        RegistreerKunstwerkCommand("Brug A", KunstwerkType.BRUG, "A12 km 4")
    )
    publisher.events.clear()

    result = StelKunstwerkBuitenGebruik(uow, publisher, clock)(
        StelKunstwerkBuitenGebruikCommand(
            kunstwerk_id=str(kunstwerk.kunstwerk_id),
            reden="renovatie",
            datum=date(2026, 7, 2),
        )
    )

    assert result.status == KunstwerkStatus.BUITEN_GEBRUIK
    assert publisher.events[0].event_type == "beheer.kunstwerk.buitengebruikgesteld"


def test_eisen_vaststellen_versioneert_en_vervangt_vorige() -> None:
    uow = FakeUnitOfWork()
    publisher = FakePublisher()
    clock = FixedClock()
    ids = SequenceIdGenerator()
    registreer = RegistreerKunstwerk(uow, publisher, clock, ids)
    kunstwerk = registreer(
        RegistreerKunstwerkCommand("Sluis A", KunstwerkType.SLUIS, "IJmuiden")
    )
    command = StelEisenVastCommand(
        kunstwerk_id=str(kunstwerk.kunstwerk_id),
        eisen=[
            Eis(
                code="SPOOR",
                omschrijving="Spoorvorming maximaal",
                meetwaarde="spoorvorming",
                operator=EisOperator.KLEINER_OF_GELIJK,
                grenswaarde=8.0,
                eenheid="mm",
            )
        ],
    )

    eerste = StelOnderhoudseisenVast(uow, publisher, clock, ids)(command)
    tweede = StelOnderhoudseisenVast(uow, publisher, clock, ids)(command)

    assert eerste.status == EisenpakketStatus.VERVANGEN
    assert tweede.versie == 2
    assert publisher.events[-1].event_type == "beheer.onderhoudseisen.vastgesteld"


def test_monitoring_rapport_wordt_idempotent_beoordeeld_tegen_ontwerpeisen() -> None:
    uow = FakeUnitOfWork()
    publisher = FakePublisher()
    clock = FixedClock()
    ids = SequenceIdGenerator()
    kunstwerk = RegistreerKunstwerk(uow, publisher, clock, ids)(
        RegistreerKunstwerkCommand("Tunnel A", KunstwerkType.TUNNEL, "A2")
    )
    StelOntwerpeisenVast(uow, publisher, clock, ids)(
        StelEisenVastCommand(
            kunstwerk_id=str(kunstwerk.kunstwerk_id),
            eisen=[
                Eis(
                    code="TRILLING",
                    omschrijving="Trilling maximaal",
                    meetwaarde="trilling",
                    operator=EisOperator.KLEINER_OF_GELIJK,
                    grenswaarde=5.0,
                    eenheid="mm/s",
                )
            ],
        )
    )
    use_case = VerwerkMonitoringRapport(uow, EisenValidator(), clock, ids)
    command = VerwerkRapportCommand(
        bron_event_id="evt-1",
        extern_rapport_id="rapport-1",
        kunstwerk_id=str(kunstwerk.kunstwerk_id),
        rapportwaarden={"trilling": 6.2},
        event_type="monitoring.rapport.opgesteld",
        occurred_at=clock.now(),
    )

    eerste = use_case(command)
    tweede = use_case(command)

    assert eerste.beoordeling_id == tweede.beoordeling_id
    assert eerste.resultaat == RapportageResultaat.VOLDOET_NIET
    assert len(uow.state.beoordelingen) == 1


def test_onderhoud_afgerond_wordt_beoordeeld_tegen_onderhoudseisen() -> None:
    uow = FakeUnitOfWork()
    publisher = FakePublisher()
    clock = FixedClock()
    ids = SequenceIdGenerator()
    kunstwerk = RegistreerKunstwerk(uow, publisher, clock, ids)(
        RegistreerKunstwerkCommand("Gemaal A", KunstwerkType.GEMAAL, "Zeeland")
    )
    StelOnderhoudseisenVast(uow, publisher, clock, ids)(
        StelEisenVastCommand(
            kunstwerk_id=str(kunstwerk.kunstwerk_id),
            eisen=[
                Eis(
                    code="CORROSIE",
                    omschrijving="Corrosiescore minimaal",
                    meetwaarde="corrosiescore",
                    operator=EisOperator.GROTER_OF_GELIJK,
                    grenswaarde=7.0,
                    eenheid="score",
                )
            ],
        )
    )

    beoordeling = VerwerkOnderhoudAfgerond(uow, EisenValidator(), clock, ids)(
        VerwerkRapportCommand(
            bron_event_id="evt-onderhoud-1",
            extern_rapport_id="onderhoud-1",
            kunstwerk_id=str(kunstwerk.kunstwerk_id),
            rapportwaarden={"corrosiescore": 8.0},
            event_type="onderhoud.onderhoud.afgerond",
            occurred_at=clock.now(),
        )
    )

    assert beoordeling.resultaat == RapportageResultaat.VOLDOET


def test_monitoring_event_envelope_leidt_tot_netwerkrapportage_beoordeling() -> None:
    uow = FakeUnitOfWork()
    publisher = FakePublisher()
    clock = FixedClock()
    ids = SequenceIdGenerator()
    kunstwerk = RegistreerKunstwerk(uow, publisher, clock, ids)(
        RegistreerKunstwerkCommand("Tunnel B", KunstwerkType.TUNNEL, "A4")
    )
    StelOntwerpeisenVast(uow, publisher, clock, ids)(
        StelEisenVastCommand(
            kunstwerk_id=str(kunstwerk.kunstwerk_id),
            eisen=[
                Eis(
                    code="TRILLING",
                    omschrijving="Trilling maximaal",
                    meetwaarde="trilling",
                    operator=EisOperator.KLEINER_OF_GELIJK,
                    grenswaarde=5.0,
                    eenheid="mm/s",
                )
            ],
        )
    )
    event_id = str(uuid4())
    command = monitoring_rapport_command_from_envelope(
        {
            "eventId": event_id,
            "eventType": "monitoring.rapport.opgesteld",
            "occurredAt": "2026-07-01T12:00:00Z",
            "producer": "monitoring",
            "version": 1,
            "data": {
                "incidentId": "INC-2",
                "kunstwerkId": str(kunstwerk.kunstwerk_id),
                "resultaten": {"trilling": 4.1},
            },
        }
    )
    use_case = VerwerkMonitoringRapport(uow, EisenValidator(), clock, ids)

    eerste = use_case(command)
    tweede = use_case(command)

    assert eerste.beoordeling_id == tweede.beoordeling_id
    assert eerste.resultaat == RapportageResultaat.VOLDOET
    assert event_id in uow.state.verwerkte_events
    assert len(uow.state.beoordelingen) == 1


def test_onderhoud_event_envelope_leidt_tot_onderhoudsrapport_beoordeling() -> None:
    uow = FakeUnitOfWork()
    publisher = FakePublisher()
    clock = FixedClock()
    ids = SequenceIdGenerator()
    kunstwerk = RegistreerKunstwerk(uow, publisher, clock, ids)(
        RegistreerKunstwerkCommand("Brug B", KunstwerkType.BRUG, "A15")
    )
    StelOnderhoudseisenVast(uow, publisher, clock, ids)(
        StelEisenVastCommand(
            kunstwerk_id=str(kunstwerk.kunstwerk_id),
            eisen=[
                Eis(
                    code="SPOOR",
                    omschrijving="Spoorvorming maximaal",
                    meetwaarde="spoorvorming",
                    operator=EisOperator.KLEINER_OF_GELIJK,
                    grenswaarde=8.0,
                    eenheid="mm",
                )
            ],
        )
    )
    command = onderhoud_afgerond_command_from_envelope(
        {
            "eventId": str(uuid4()),
            "eventType": "onderhoud.onderhoud.afgerond",
            "occurredAt": "2026-07-01T12:30:00Z",
            "producer": "onderhoud",
            "version": 1,
            "data": {
                "onderhoudId": "OH-2",
                "kunstwerkId": str(kunstwerk.kunstwerk_id),
                "datum": "2026-07-01",
                "resultaat": [{"meetwaarde": "spoorvorming", "waarde": 7.5}],
            },
        }
    )

    beoordeling = VerwerkOnderhoudAfgerond(uow, EisenValidator(), clock, ids)(command)

    assert beoordeling.extern_rapport_id == "OH-2"
    assert beoordeling.resultaat == RapportageResultaat.VOLDOET
    assert beoordeling.bevindingen[0].eis_code == "SPOOR"
