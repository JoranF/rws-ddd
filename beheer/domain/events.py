from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any


@dataclass(frozen=True, slots=True)
class DomainEvent:
    occurred_at: datetime

    @property
    def event_type(self) -> str:
        raise NotImplementedError

    def data(self) -> dict[str, Any]:
        raise NotImplementedError


@dataclass(frozen=True, slots=True)
class KunstwerkGeregistreerd(DomainEvent):
    kunstwerk_id: str
    type: str
    locatie: str
    status: str

    @property
    def event_type(self) -> str:
        return "beheer.kunstwerk.geregistreerd"

    def data(self) -> dict[str, Any]:
        return {
            "kunstwerkId": self.kunstwerk_id,
            "type": self.type,
            "locatie": self.locatie,
            "status": self.status,
        }


@dataclass(frozen=True, slots=True)
class KunstwerkBuitengebruikgesteld(DomainEvent):
    kunstwerk_id: str
    reden: str
    datum: date

    @property
    def event_type(self) -> str:
        return "beheer.kunstwerk.buitengebruikgesteld"

    def data(self) -> dict[str, Any]:
        return {
            "kunstwerkId": self.kunstwerk_id,
            "reden": self.reden,
            "datum": self.datum.isoformat(),
        }


@dataclass(frozen=True, slots=True)
class OnderhoudseisenVastgesteld(DomainEvent):
    kunstwerk_id: str
    eisen: list[dict[str, Any]]

    @property
    def event_type(self) -> str:
        return "beheer.onderhoudseisen.vastgesteld"

    def data(self) -> dict[str, Any]:
        return {"kunstwerkId": self.kunstwerk_id, "eisen": self.eisen}


@dataclass(frozen=True, slots=True)
class OntwerpeisenVastgesteld(DomainEvent):
    kunstwerk_id: str
    eisen: list[dict[str, Any]]

    @property
    def event_type(self) -> str:
        return "beheer.ontwerpeisen.vastgesteld"

    def data(self) -> dict[str, Any]:
        return {"kunstwerkId": self.kunstwerk_id, "eisen": self.eisen}
