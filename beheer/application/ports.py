from __future__ import annotations

from datetime import datetime
from typing import Protocol

from domain.events import DomainEvent
from domain.repositories import (
    EisenpakketRepository,
    KunstwerkRepository,
    RapportageBeoordelingRepository,
    VerwerktEventRepository,
)


class EventPublisher(Protocol):
    def publish(self, events: list[DomainEvent]) -> None: ...


class Clock(Protocol):
    def now(self) -> datetime: ...


class IdGenerator(Protocol):
    def new_id(self) -> str: ...


class UnitOfWork(Protocol):
    kunstwerken: KunstwerkRepository
    eisenpakketten: EisenpakketRepository
    beoordelingen: RapportageBeoordelingRepository
    verwerkte_events: VerwerktEventRepository

    def __enter__(self) -> UnitOfWork: ...

    def __exit__(self, exc_type: object, exc: object, tb: object) -> None: ...

    def commit(self) -> None: ...

    def rollback(self) -> None: ...
