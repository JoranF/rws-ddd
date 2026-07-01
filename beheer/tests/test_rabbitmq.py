from __future__ import annotations

from domain.events import KunstwerkGeregistreerd
from infrastructure.rabbitmq import RabbitMqEventPublisher
from tests.fakes import FixedClock


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
