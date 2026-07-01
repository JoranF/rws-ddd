from __future__ import annotations

import json
from datetime import UTC
from uuid import uuid4

import pika

from domain.events import DomainEvent


class RabbitMqEventPublisher:
    def __init__(
        self,
        rabbitmq_url: str,
        exchange: str = "rws.events",
        producer: str = "beheer",
    ) -> None:
        self.rabbitmq_url = rabbitmq_url
        self.exchange = exchange
        self.producer = producer

    def publish(self, events: list[DomainEvent]) -> None:
        if not events:
            return
        parameters = pika.URLParameters(self.rabbitmq_url)
        connection = pika.BlockingConnection(parameters)
        try:
            channel = connection.channel()
            channel.exchange_declare(exchange=self.exchange, exchange_type="topic", durable=True)
            for event in events:
                body = json.dumps(self.envelope(event), ensure_ascii=False).encode("utf-8")
                channel.basic_publish(
                    exchange=self.exchange,
                    routing_key=event.event_type,
                    body=body,
                    properties=pika.BasicProperties(
                        content_type="application/json",
                        delivery_mode=2,
                    ),
                )
        finally:
            connection.close()

    def envelope(self, event: DomainEvent) -> dict[str, object]:
        occurred_at = event.occurred_at.astimezone(UTC)
        return {
            "eventId": str(uuid4()),
            "eventType": event.event_type,
            "occurredAt": occurred_at.isoformat().replace("+00:00", "Z"),
            "producer": self.producer,
            "version": 1,
            "data": event.data(),
        }


def check_rabbitmq(rabbitmq_url: str, exchange: str = "rws.events") -> bool:
    parameters = pika.URLParameters(rabbitmq_url)
    connection = pika.BlockingConnection(parameters)
    try:
        channel = connection.channel()
        channel.exchange_declare(exchange=exchange, exchange_type="topic", durable=True)
    finally:
        connection.close()
    return True
