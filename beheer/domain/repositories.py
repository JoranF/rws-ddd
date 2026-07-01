from __future__ import annotations

from datetime import datetime
from typing import Protocol

from domain.model import (
    EisenSoort,
    Eisenpakket,
    Kunstwerk,
    KunstwerkId,
    RapportageBeoordeling,
    RapportageType,
)


class KunstwerkRepository(Protocol):
    def add(self, kunstwerk: Kunstwerk) -> None: ...

    def save(self, kunstwerk: Kunstwerk) -> None: ...

    def get(self, kunstwerk_id: KunstwerkId) -> Kunstwerk | None: ...

    def list(self) -> list[Kunstwerk]: ...


class EisenpakketRepository(Protocol):
    def add(self, eisenpakket: Eisenpakket) -> None: ...

    def save(self, eisenpakket: Eisenpakket) -> None: ...

    def get(self, eisenpakket_id: str) -> Eisenpakket | None: ...

    def get_current(self, kunstwerk_id: KunstwerkId, soort: EisenSoort) -> Eisenpakket | None: ...

    def list_for_kunstwerk(
        self,
        kunstwerk_id: KunstwerkId,
        soort: EisenSoort | None = None,
    ) -> list[Eisenpakket]: ...

    def next_version(self, kunstwerk_id: KunstwerkId, soort: EisenSoort) -> int: ...


class RapportageBeoordelingRepository(Protocol):
    def add(self, beoordeling: RapportageBeoordeling) -> None: ...

    def get(self, beoordeling_id: str) -> RapportageBeoordeling | None: ...

    def get_by_bron_event_id(self, bron_event_id: str) -> RapportageBeoordeling | None: ...

    def list(
        self,
        kunstwerk_id: KunstwerkId | None = None,
        rapportage_type: RapportageType | None = None,
    ) -> list[RapportageBeoordeling]: ...


class VerwerktEventRepository(Protocol):
    def has(self, event_id: str) -> bool: ...

    def add(
        self,
        event_id: str,
        event_type: str,
        occurred_at: datetime,
        processed_at: datetime,
    ) -> None: ...
