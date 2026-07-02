from __future__ import annotations

import json
import logging
import threading
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import pika
from pydantic import (
    BaseModel,
    ConfigDict,
    StrictInt,
    StrictStr,
    ValidationError,
    field_validator,
)

from application.dto import VerwerkRapportCommand
from application.use_cases import VerwerkMonitoringRapport, VerwerkOnderhoudAfgerond

logger = logging.getLogger(__name__)


class InvalidEventEnvelope(ValueError):
    pass


class EventEnvelope(BaseModel):
    model_config = ConfigDict(extra="allow")

    eventId: UUID
    eventType: StrictStr
    occurredAt: datetime
    producer: StrictStr
    version: StrictInt
    data: dict[str, Any]

    @field_validator("eventType", "producer")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("mag niet leeg zijn")
        return value

    @field_validator("occurredAt")
    @classmethod
    def _must_be_utc(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() != timedelta(0):
            raise ValueError("moet een UTC timestamp zijn")
        return value


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
            command_factory=monitoring_rapport_command_from_envelope,
        )
        self._start_consumer(
            queue_name="beheer.onderhoud_afgerond",
            routing_key="onderhoud.onderhoud.afgerond",
            handler_factory=self.onderhoud_factory,
            command_factory=onderhoud_afgerond_command_from_envelope,
        )

    def _start_consumer(
        self,
        queue_name: str,
        routing_key: str,
        handler_factory: Callable[[], object],
        command_factory: Callable[[object], VerwerkRapportCommand],
    ) -> None:
        thread = threading.Thread(
            target=self._consume,
            args=(queue_name, routing_key, handler_factory, command_factory),
            daemon=True,
        )
        thread.start()
        self._threads.append(thread)

    def _consume(
        self,
        queue_name: str,
        routing_key: str,
        handler_factory: Callable[[], object],
        command_factory: Callable[[object], VerwerkRapportCommand],
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
                    command = command_factory(envelope)
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


def monitoring_rapport_command_from_envelope(envelope: object) -> VerwerkRapportCommand:
    return _command_from_envelope(
        envelope=envelope,
        expected_event_type="monitoring.rapport.opgesteld",
        expected_producer="monitoring",
        required_data_fields=("incidentId", "kunstwerkId", "resultaten"),
        external_id_fields=("rapportId", "incidentId"),
        values_fields=("resultaten",),
    )


def onderhoud_afgerond_command_from_envelope(envelope: object) -> VerwerkRapportCommand:
    return _command_from_envelope(
        envelope=envelope,
        expected_event_type="onderhoud.onderhoud.afgerond",
        expected_producer="onderhoud",
        required_data_fields=("onderhoudId", "kunstwerkId", "resultaat", "datum"),
        external_id_fields=("rapportId", "onderhoudId"),
        values_fields=("rapportwaarden", "resultaat"),
    )


def _command_from_envelope(
    envelope: object,
    expected_event_type: str,
    expected_producer: str,
    required_data_fields: tuple[str, ...],
    external_id_fields: tuple[str, ...],
    values_fields: tuple[str, ...],
) -> VerwerkRapportCommand:
    validated = _validated_envelope(
        envelope=envelope,
        expected_event_type=expected_event_type,
        expected_producer=expected_producer,
        required_data_fields=required_data_fields,
    )
    data = validated.data
    external_id = _first_present(data, external_id_fields) or validated.eventId
    values_source = _first_present(data, values_fields)
    return VerwerkRapportCommand(
        bron_event_id=str(validated.eventId),
        extern_rapport_id=str(external_id),
        kunstwerk_id=str(data["kunstwerkId"]),
        rapportwaarden=_extract_numeric_values(values_source),
        event_type=validated.eventType,
        occurred_at=_ensure_utc(validated.occurredAt),
    )


def _validated_envelope(
    envelope: object,
    expected_event_type: str,
    expected_producer: str,
    required_data_fields: tuple[str, ...],
) -> EventEnvelope:
    try:
        validated = EventEnvelope.model_validate(envelope)
    except ValidationError as exc:
        raise InvalidEventEnvelope(f"Ongeldige event-envelope: {exc}") from exc

    if validated.eventType != expected_event_type:
        raise InvalidEventEnvelope(
            f"eventType moet '{expected_event_type}' zijn, kreeg '{validated.eventType}'"
        )
    if validated.producer != expected_producer:
        raise InvalidEventEnvelope(
            f"producer moet '{expected_producer}' zijn, kreeg '{validated.producer}'"
        )
    if validated.version != 1:
        raise InvalidEventEnvelope(f"version moet 1 zijn, kreeg {validated.version}")

    for field_name in required_data_fields:
        if field_name not in validated.data:
            raise InvalidEventEnvelope(f"data.{field_name} ontbreekt")
        value = validated.data[field_name]
        if value is None or (isinstance(value, str) and not value.strip()):
            raise InvalidEventEnvelope(f"data.{field_name} is verplicht")
    return validated


def _first_present(data: dict[str, Any], names: tuple[str, ...]) -> Any:
    for name in names:
        value = data.get(name)
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        return value
    return None


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _extract_numeric_values(source: Any) -> dict[str, float]:
    values: dict[str, float] = {}
    if isinstance(source, dict):
        for key, value in source.items():
            numeric = _numeric_value(value)
            if numeric is not None:
                values[str(key)] = numeric
            elif isinstance(value, dict):
                name = value.get("meetwaarde") or value.get("code") or key
                numeric = _numeric_from_mapping(value)
                if name and numeric is not None:
                    values[str(name)] = numeric
    elif isinstance(source, list):
        for item in source:
            if not isinstance(item, dict):
                continue
            name = item.get("meetwaarde") or item.get("code") or item.get("naam")
            numeric = _numeric_from_mapping(item)
            if name and numeric is not None:
                values[str(name)] = numeric
    return values


def _numeric_from_mapping(value: dict[str, Any]) -> float | None:
    numeric = value.get("waarde")
    if numeric is None:
        numeric = value.get("value")
    return _numeric_value(numeric)


def _numeric_value(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None
