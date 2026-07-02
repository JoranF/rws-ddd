from __future__ import annotations

from datetime import date

import pytest

from domain.exceptions import DomainError
from domain.model import (
    Eis,
    EisOperator,
    Eisenpakket,
    EisenSoort,
    Kunstwerk,
    KunstwerkId,
    KunstwerkStatus,
    KunstwerkType,
    Locatie,
    RapportageResultaat,
)
from domain.services import EisenValidator
from tests.fakes import FixedClock


pytestmark = pytest.mark.unit


def test_kunstwerk_registreert_event_en_kan_buiten_gebruik() -> None:
    now = FixedClock().now()
    kunstwerk = Kunstwerk.registreer(
        kunstwerk_id=KunstwerkId("KW-1"),
        naam="Brug A",
        type=KunstwerkType.BRUG,
        locatie=Locatie("A12 km 4"),
        now=now,
    )

    events = kunstwerk.pull_events()
    assert events[0].event_type == "beheer.kunstwerk.geregistreerd"

    kunstwerk.stel_buiten_gebruik("renovatie", date(2026, 7, 2), now)
    assert kunstwerk.status == KunstwerkStatus.BUITEN_GEBRUIK
    assert kunstwerk.pull_events()[0].event_type == "beheer.kunstwerk.buitengebruikgesteld"

    with pytest.raises(DomainError):
        kunstwerk.stel_buiten_gebruik("nog eens", date(2026, 7, 3), now)


def test_eisenpakket_vaststellen_requires_eis() -> None:
    with pytest.raises(DomainError):
        Eisenpakket.stel_vast(
            eisenpakket_id="EP-1",
            kunstwerk_id=KunstwerkId("KW-1"),
            soort=EisenSoort.ONDERHOUDSEISEN,
            versie=1,
            eisen=[],
            now=FixedClock().now(),
        )


def test_eisen_validator_bepaalt_voldoet_en_voldoet_niet() -> None:
    now = FixedClock().now()
    pakket = Eisenpakket.stel_vast(
        eisenpakket_id="EP-1",
        kunstwerk_id=KunstwerkId("KW-1"),
        soort=EisenSoort.ONTWERPEISEN,
        versie=1,
        eisen=[
            Eis(
                code="TRILLING",
                omschrijving="Maximale trilling",
                meetwaarde="trilling",
                operator=EisOperator.KLEINER_OF_GELIJK,
                grenswaarde=5.0,
                eenheid="mm/s",
            )
        ],
        now=now,
    )
    validator = EisenValidator()

    resultaat, bevindingen = validator.beoordeel(pakket, {"trilling": 4.5})
    assert resultaat == RapportageResultaat.VOLDOET
    assert bevindingen[0].resultaat.value == "Voldoet"

    resultaat, bevindingen = validator.beoordeel(pakket, {"trilling": 6.0})
    assert resultaat == RapportageResultaat.VOLDOET_NIET
    assert bevindingen[0].resultaat.value == "VoldoetNiet"

    resultaat, bevindingen = validator.beoordeel(pakket, {})
    assert resultaat == RapportageResultaat.NIET_TE_BEOORDELEN
    assert bevindingen[0].resultaat.value == "NietTeBeoordelen"
