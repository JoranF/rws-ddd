from __future__ import annotations

import json
import logging
import threading
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import pika

from application.dto import VerwerkRapportCommand
from application.use_cases import VerwerkMonitoringRapport, VerwerkOnderhoudAfgerond

logger = logging.getLogger(__name__)


class RabbitMqConsumerRunner:
    def __init__(
        self,
        rabbitmq_url: str,
        exchange: str,
        monitoring_factory: Callable[[], VerwerkMonitoringRapport],
        onderhoud_factory: Callable[[], VerwerkOnderhoudAfgerond],
    ) -> None:
        self.rabbitmq_url = rabbitmq_url
        self.exchange = exchange
        self.monitoring_factory = monitoring_factory
        self.onderhoud_factory = onderhoud_factory
        self._threads: list[threading.Thread] = []

    def start(self) -> None:
        self._start_consumer(
            queue_name="beheer.monitoring_rapport_opgesteld",
            routing_key="monitoring.rapport.opgesteld",
            handler_factory=self.monitoring_factory,
            external_id_fields=("rapportId", "incidentId"),
            values_fields=("resultaten",),
        )
        self._start_consumer(
            queue_name="beheer.onderhoud_afgerond",
            routing_key="onderhoud.onderhoud.afgerond",
            handler_factory=self.onderhoud_factory,
            external_id_fields=("rapportId", "onderhoudId"),
            values_fields=("rapportwaarden", "resultaat"),
        )

    def _start_consumer(
        self,
        queue_name: str,
        routing_key: str,
        handler_factory: Callable[[], object],
        external_id_fields: tuple[str, ...],
        values_fields: tuple[str, ...],
    ) -> None:
        thread = threading.Thread(
            target=self._consume,
            args=(queue_name, routing_key, handler_factory, external_id_fields, values_fields),
            daemon=True,
        )
        thread.start()
        self._threads.append(thread)

    def _consume(
        self,
        queue_name: str,
        routing_key: str,
        handler_factory: Callable[[], object],
        external_id_fields: tuple[str, ...],
        values_fields: tuple[str, ...],
    ) -> None:
        try:
            parameters = pika.URLParameters(self.rabbitmq_url)
            connection = pika.BlockingConnection(parameters)
            channel = connection.channel()
            channel.exchange_declare(exchange=self.exchange, exchange_type="topic", durable=True)
            channel.queue_declare(queue=queue_name, durable=True)
            channel.queue_bind(exchange=self.exchange, queue=queue_name, routing_key=routing_key)
            channel.basic_qos(prefetch_count=1)

            def on_message(
                ch: pika.adapters.blocking_connection.BlockingChannel,
                method: pika.spec.Basic.Deliver,
                _properties: pika.BasicProperties,
                body: bytes,
            ) -> None:
                try:
                    envelope = json.loads(body.decode("utf-8"))
                    command = _command_from_envelope(
                        envelope=envelope,
                        external_id_fields=external_id_fields,
                        values_fields=values_fields,
                    )
                    handler = handler_factory()
                    handler(command)
                    ch.basic_ack(delivery_tag=method.delivery_tag)
                except Exception:
                    logger.exception("Kon event %s niet verwerken", routing_key)
                    ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

            channel.basic_consume(queue=queue_name, on_message_callback=on_message)
            channel.start_consuming()
        except Exception:
            logger.exception("RabbitMQ consumer voor %s kon niet starten", routing_key)


def _command_from_envelope(
    envelope: dict[str, Any],
    external_id_fields: tuple[str, ...],
    values_fields: tuple[str, ...],
) -> VerwerkRapportCommand:
    data = envelope.get("data") or {}
    external_id = _first_present(data, external_id_fields) or envelope["eventId"]
    values_source = _first_present(data, values_fields)
    return VerwerkRapportCommand(
        bron_event_id=envelope["eventId"],
        extern_rapport_id=str(external_id),
        kunstwerk_id=str(data["kunstwerkId"]),
        rapportwaarden=_extract_numeric_values(values_source),
        event_type=envelope["eventType"],
        occurred_at=_parse_datetime(envelope["occurredAt"]),
    )


def _first_present(data: dict[str, Any], names: tuple[str, ...]) -> Any:
    for name in names:
        if name in data:
            return data[name]
    return None


def _parse_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed


def _extract_numeric_values(source: Any) -> dict[str, float]:
    values: dict[str, float] = {}
    if isinstance(source, dict):
        for key, value in source.items():
            if isinstance(value, (int, float)):
                values[str(key)] = float(value)
            elif isinstance(value, dict):
                name = value.get("meetwaarde") or value.get("code") or key
                numeric = value.get("waarde")
                if numeric is None:
                    numeric = value.get("value")
                if isinstance(numeric, (int, float)):
                    values[str(name)] = float(numeric)
    elif isinstance(source, list):
        for item in source:
            if not isinstance(item, dict):
            continue
        name = item.get("meetwaarde") or item.get("code") or item.get("naam")
        numeric = item.get("waarde")
        if numeric is None:
            numeric = item.get("value")
        if name and isinstance(numeric, (int, float)):
            values[str(name)] = float(numeric)
    return values
