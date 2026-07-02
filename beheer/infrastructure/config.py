from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Settings:
    service_port: int
    database_url: str
    rabbitmq_url: str
    rabbitmq_exchange: str = "rws.events"
    enable_consumers: bool = True


def get_settings() -> Settings:
    return Settings(
        service_port=int(os.getenv("SERVICE_PORT", "8004")),
        database_url=os.getenv(
            "DATABASE_URL",
            "postgresql+psycopg://rws:rws@localhost:5432/beheer_db",
        ),
        rabbitmq_url=os.getenv("RABBITMQ_URL", "amqp://rws:rws@localhost:5672"),
        enable_consumers=os.getenv("ENABLE_RABBITMQ_CONSUMERS", "true").lower()
        in {"1", "true", "yes", "ja"},
    )


def sqlalchemy_url(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url.removeprefix("postgres://")
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url.removeprefix("postgresql://")
    return url
