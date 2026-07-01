from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from domain.model import Eis, KunstwerkStatus, KunstwerkType


@dataclass(frozen=True, slots=True)
class RegistreerKunstwerkCommand:
    naam: str
    type: KunstwerkType
    locatie: str
    status: KunstwerkStatus = KunstwerkStatus.GEREGISTREERD
    kunstwerk_id: str | None = None
    beheerder: str | None = None
    jaar_renovatie: int | None = None
    laatste_inspectiedatum: date | None = None


@dataclass(frozen=True, slots=True)
class WijzigKunstwerkBasisgegevensCommand:
    kunstwerk_id: str
    naam: str | None = None
    type: KunstwerkType | None = None
    locatie: str | None = None
    status: KunstwerkStatus | None = None
    beheerder: str | None = None
    jaar_renovatie: int | None = None
    laatste_inspectiedatum: date | None = None


@dataclass(frozen=True, slots=True)
class StelKunstwerkBuitenGebruikCommand:
    kunstwerk_id: str
    reden: str
    datum: date


@dataclass(frozen=True, slots=True)
class StelEisenVastCommand:
    kunstwerk_id: str
    eisen: list[Eis]
    onderhoudsstrategie: str | None = None


@dataclass(frozen=True, slots=True)
class VerwerkRapportCommand:
    bron_event_id: str
    extern_rapport_id: str
    kunstwerk_id: str
    rapportwaarden: dict[str, float]
    event_type: str
    occurred_at: datetime
