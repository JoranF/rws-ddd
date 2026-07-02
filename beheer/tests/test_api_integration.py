from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from application.use_cases import (
    BeheerQueries,
    RegistreerKunstwerk,
    StelKunstwerkBuitenGebruik,
    StelOnderhoudseisenVast,
    StelOntwerpeisenVast,
    WijzigKunstwerkBasisgegevens,
)
from interface.routes import RouteServices, create_router
from tests.fakes import (
    FakePublisher,
    FakeUnitOfWork,
    FixedClock,
    InMemoryState,
    SequenceIdGenerator,
)


pytestmark = pytest.mark.integration


def _test_client() -> tuple[TestClient, FakePublisher]:
    state = InMemoryState()
    publisher = FakePublisher()
    clock = FixedClock()
    ids = SequenceIdGenerator()

    def uow() -> FakeUnitOfWork:
        return FakeUnitOfWork(state)

    services = RouteServices(
        registreer_kunstwerk=lambda: RegistreerKunstwerk(uow(), publisher, clock, ids),
        wijzig_kunstwerk=lambda: WijzigKunstwerkBasisgegevens(uow(), clock),
        stel_buiten_gebruik=lambda: StelKunstwerkBuitenGebruik(uow(), publisher, clock),
        stel_onderhoudseisen_vast=lambda: StelOnderhoudseisenVast(
            uow(),
            publisher,
            clock,
            ids,
        ),
        stel_ontwerpeisen_vast=lambda: StelOntwerpeisenVast(uow(), publisher, clock, ids),
        queries=lambda: BeheerQueries(uow()),
    )
    app = FastAPI()
    app.include_router(create_router(services))
    return TestClient(app), publisher


def test_kunstwerk_http_flow_registreert_wijzigt_en_publiceert_events() -> None:
    client, publisher = _test_client()

    response = client.post(
        "/api/kunstwerken",
        json={
            "kunstwerkId": "KW-INT-1",
            "naam": "Brug Integratie",
            "type": "Brug",
            "locatie": "A12 km 4",
            "status": "Geregistreerd",
        },
    )

    assert response.status_code == 201
    assert response.json()["kunstwerkId"] == "KW-INT-1"

    response = client.patch(
        "/api/kunstwerken/KW-INT-1",
        json={"status": "InGebruik", "beheerder": "Rijkswaterstaat"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "InGebruik"
    assert response.json()["beheerder"] == "Rijkswaterstaat"

    response = client.post(
        "/api/kunstwerken/KW-INT-1/buitengebruikstelling",
        json={"reden": "renovatie", "datum": "2026-07-02"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "BuitenGebruik"
    assert [event.event_type for event in publisher.events] == [
        "beheer.kunstwerk.geregistreerd",
        "beheer.kunstwerk.buitengebruikgesteld",
    ]


def test_eisen_http_flow_versioneert_en_geeft_laatste_eisen_terug() -> None:
    client, publisher = _test_client()
    client.post(
        "/api/kunstwerken",
        json={
            "kunstwerkId": "KW-INT-2",
            "naam": "Tunnel Integratie",
            "type": "Tunnel",
            "locatie": "A2",
        },
    )

    eerste = client.post(
        "/api/kunstwerken/KW-INT-2/onderhoudseisen",
        json={
            "eisen": [
                {
                    "code": "SPOOR",
                    "omschrijving": "Spoorvorming maximaal",
                    "meetwaarde": "spoorvorming",
                    "operator": "<=",
                    "grenswaarde": 8.0,
                    "eenheid": "mm",
                }
            ]
        },
    )
    tweede = client.post(
        "/api/kunstwerken/KW-INT-2/onderhoudseisen",
        json={
            "eisen": [
                {
                    "code": "SPOOR",
                    "omschrijving": "Spoorvorming aangescherpt",
                    "meetwaarde": "spoorvorming",
                    "operator": "<=",
                    "grenswaarde": 6.0,
                    "eenheid": "mm",
                }
            ]
        },
    )

    assert eerste.status_code == 201
    assert tweede.status_code == 201

    response = client.get("/api/kunstwerken/KW-INT-2/eisen")
    pakketten = response.json()

    assert response.status_code == 200
    assert [pakket["versie"] for pakket in pakketten] == [1, 2]
    assert [pakket["status"] for pakket in pakketten] == ["Vervangen", "Vastgesteld"]

    response = client.get("/api/kunstwerken/KW-INT-2/onderhoudseisen")

    assert response.status_code == 200
    assert response.json()["versie"] == 2
    assert response.json()["eisen"][0]["grenswaarde"] == 6.0
    assert [event.event_type for event in publisher.events] == [
        "beheer.kunstwerk.geregistreerd",
        "beheer.onderhoudseisen.vastgesteld",
        "beheer.onderhoudseisen.vastgesteld",
    ]
