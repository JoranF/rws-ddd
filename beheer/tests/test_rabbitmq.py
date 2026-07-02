from __future__ import annotations

from datetime import datetime
from uuid import uuid4

import pytest

from domain.events import KunstwerkGeregistreerd
from infrastructure.rabbitmq import RabbitMqEventPublisher
from infrastructure.rabbitmq_consumer import (
    InvalidEventEnvelope,
    monitoring_rapport_command_from_envelope,
    onderhoud_afgerond_command_from_envelope,
)
from tests.fakes import FixedClock


pytestmark = pytest.mark.interface


def test_rabbitmq_envelope_volgt_published_language() -> None:
    publisher = RabbitMqEventPublisher("amqp://rws:rws@localhost:5672")
    envelope = publisher.envelope(
        KunstwerkGeregistreerd(
            occurred_at=FixedClock().now(),
            kunstwerk_id="KW-1",
            type="Brug",
            locatie="A12 km 4",
            status="Geregistreerd",
        )
    )

    assert envelope["eventType"] == "beheer.kunstwerk.geregistreerd"
    assert envelope["producer"] == "beheer"
    assert envelope["version"] == 1
    assert envelope["data"] == {
        "kunstwerkId": "KW-1",
        "type": "Brug",
        "locatie": "A12 km 4",
        "status": "Geregistreerd",
    }


def test_monitoring_rapport_wordt_streng_naar_command_gemapt() -> None:
    event_id = str(uuid4())

    command = monitoring_rapport_command_from_envelope(
        {
            "eventId": event_id,
            "eventType": "monitoring.rapport.opgesteld",
            "occurredAt": "2026-07-01T12:00:00Z",
            "producer": "monitoring",
            "version": 1,
            "data": {
                "incidentId": "INC-1",
                "kunstwerkId": "KW-1",
                "resultaten": [
                    {"meetwaarde": "trilling", "waarde": 4.2},
                    {"code": "SCHEUR", "value": 1.0},
                ],
            },
        }
    )

    assert command.bron_event_id == event_id
    assert command.extern_rapport_id == "INC-1"
    assert command.kunstwerk_id == "KW-1"
    assert command.rapportwaarden == {"trilling": 4.2, "SCHEUR": 1.0}
    assert command.event_type == "monitoring.rapport.opgesteld"
    assert command.occurred_at == datetime.fromisoformat("2026-07-01T12:00:00+00:00")


def test_onderhoud_afgerond_haalt_onderhoudsrapport_uit_resultaat() -> None:
    command = onderhoud_afgerond_command_from_envelope(
        {
            "eventId": str(uuid4()),
            "eventType": "onderhoud.onderhoud.afgerond",
            "occurredAt": "2026-07-01T13:00:00Z",
            "producer": "onderhoud",
            "version": 1,
            "data": {
                "onderhoudId": "OH-1",
                "kunstwerkId": "KW-1",
                "datum": "2026-07-01",
                "resultaat": {
                    "corrosiescore": {"waarde": 8.0},
                    "speling": 2.5,
                },
            },
        }
    )

    assert command.extern_rapport_id == "OH-1"
    assert command.rapportwaarden == {"corrosiescore": 8.0, "speling": 2.5}
    assert command.event_type == "onderhoud.onderhoud.afgerond"


def test_event_validatie_weigert_verkeerde_producer() -> None:
    with pytest.raises(InvalidEventEnvelope, match="producer"):
        monitoring_rapport_command_from_envelope(
            {
                "eventId": str(uuid4()),
                "eventType": "monitoring.rapport.opgesteld",
                "occurredAt": "2026-07-01T12:00:00Z",
                "producer": "contract",
                "version": 1,
                "data": {
                    "incidentId": "INC-1",
                    "kunstwerkId": "KW-1",
                    "resultaten": {"trilling": 4.2},
                },
            }
        )


def test_event_validatie_weigert_ontbrekende_verplichte_data() -> None:
    with pytest.raises(InvalidEventEnvelope, match="kunstwerkId"):
        onderhoud_afgerond_command_from_envelope(
            {
                "eventId": str(uuid4()),
                "eventType": "onderhoud.onderhoud.afgerond",
                "occurredAt": "2026-07-01T12:00:00Z",
                "producer": "onderhoud",
                "version": 1,
                "data": {
                    "onderhoudId": "OH-1",
                    "datum": "2026-07-01",
                    "resultaat": {"corrosiescore": 8.0},
                },
            }
        )
