from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime

from application.ports import EventPublisher
from domain.events import DomainEvent
from domain.model import (
    EisenSoort,
    Eisenpakket,
    EisenpakketStatus,
    Kunstwerk,
    KunstwerkId,
    RapportageBeoordeling,
    RapportageType,
)


@dataclass
class InMemoryState:
    kunstwerken: dict[str, Kunstwerk] = field(default_factory=dict)
    eisenpakketten: dict[str, Eisenpakket] = field(default_factory=dict)
    beoordelingen: dict[str, RapportageBeoordeling] = field(default_factory=dict)
    verwerkte_events: set[str] = field(default_factory=set)


class InMemoryKunstwerkRepository:
    def __init__(self, state: InMemoryState) -> None:
        self.state = state

    def add(self, kunstwerk: Kunstwerk) -> None:
        self.state.kunstwerken[str(kunstwerk.kunstwerk_id)] = kunstwerk

    def save(self, kunstwerk: Kunstwerk) -> None:
        self.add(kunstwerk)

    def get(self, kunstwerk_id: KunstwerkId) -> Kunstwerk | None:
        return self.state.kunstwerken.get(str(kunstwerk_id))

    def list(self) -> list[Kunstwerk]:
        return list(self.state.kunstwerken.values())


class InMemoryEisenpakketRepository:
    def __init__(self, state: InMemoryState) -> None:
        self.state = state

    def add(self, eisenpakket: Eisenpakket) -> None:
        self.state.eisenpakketten[eisenpakket.eisenpakket_id] = eisenpakket

    def save(self, eisenpakket: Eisenpakket) -> None:
        self.add(eisenpakket)

    def get(self, eisenpakket_id: str) -> Eisenpakket | None:
        return self.state.eisenpakketten.get(eisenpakket_id)

    def get_current(self, kunstwerk_id: KunstwerkId, soort: EisenSoort) -> Eisenpakket | None:
        pakketten = [
            pakket
            for pakket in self.state.eisenpakketten.values()
            if str(pakket.kunstwerk_id) == str(kunstwerk_id)
            and pakket.soort == soort
            and pakket.status == EisenpakketStatus.VASTGESTELD
        ]
        return max(pakketten, key=lambda pakket: pakket.versie, default=None)

    def list_for_kunstwerk(
        self,
        kunstwerk_id: KunstwerkId,
        soort: EisenSoort | None = None,
    ) -> list[Eisenpakket]:
        return [
            pakket
            for pakket in self.state.eisenpakketten.values()
            if str(pakket.kunstwerk_id) == str(kunstwerk_id)
            and (soort is None or pakket.soort == soort)
        ]

    def next_version(self, kunstwerk_id: KunstwerkId, soort: EisenSoort) -> int:
        versions = [
            pakket.versie
            for pakket in self.state.eisenpakketten.values()
            if str(pakket.kunstwerk_id) == str(kunstwerk_id) and pakket.soort == soort
        ]
        return max(versions, default=0) + 1


class InMemoryRapportageBeoordelingRepository:
    def __init__(self, state: InMemoryState) -> None:
        self.state = state

    def add(self, beoordeling: RapportageBeoordeling) -> None:
        self.state.beoordelingen[beoordeling.beoordeling_id] = beoordeling

    def get(self, beoordeling_id: str) -> RapportageBeoordeling | None:
        return self.state.beoordelingen.get(beoordeling_id)

    def get_by_bron_event_id(self, bron_event_id: str) -> RapportageBeoordeling | None:
        for beoordeling in self.state.beoordelingen.values():
            if beoordeling.bron_event_id == bron_event_id:
                return beoordeling
        return None

    def list(
        self,
        kunstwerk_id: KunstwerkId | None = None,
        rapportage_type: RapportageType | None = None,
    ) -> list[RapportageBeoordeling]:
        return [
            beoordeling
            for beoordeling in self.state.beoordelingen.values()
            if (kunstwerk_id is None or str(beoordeling.kunstwerk_id) == str(kunstwerk_id))
            and (rapportage_type is None or beoordeling.rapportage_type == rapportage_type)
        ]


class InMemoryVerwerktEventRepository:
    def __init__(self, state: InMemoryState) -> None:
        self.state = state

    def has(self, event_id: str) -> bool:
        return event_id in self.state.verwerkte_events

    def add(
        self,
        event_id: str,
        event_type: str,
        occurred_at: datetime,
        processed_at: datetime,
    ) -> None:
        self.state.verwerkte_events.add(event_id)


class FakeUnitOfWork:
    def __init__(self, state: InMemoryState | None = None) -> None:
        self.state = state or InMemoryState()
        self.kunstwerken = InMemoryKunstwerkRepository(self.state)
        self.eisenpakketten = InMemoryEisenpakketRepository(self.state)
        self.beoordelingen = InMemoryRapportageBeoordelingRepository(self.state)
        self.verwerkte_events = InMemoryVerwerktEventRepository(self.state)
        self.committed = False

    def __enter__(self) -> FakeUnitOfWork:
        return self

    def __exit__(self, exc_type: object, exc: object, tb: object) -> None:
        if exc_type is not None:
            self.rollback()

    def commit(self) -> None:
        self.committed = True

    def rollback(self) -> None:
        self.committed = False


class FakePublisher(EventPublisher):
    def __init__(self) -> None:
        self.events: list[DomainEvent] = []

    def publish(self, events: list[DomainEvent]) -> None:
        self.events.extend(events)


class FixedClock:
    def __init__(self, now: datetime | None = None) -> None:
        self._now = now or datetime(2026, 7, 1, 12, 0, tzinfo=UTC)

    def now(self) -> datetime:
        return self._now


class SequenceIdGenerator:
    def __init__(self) -> None:
        self.index = 0

    def new_id(self) -> str:
        self.index += 1
        return f"id-{self.index}"
