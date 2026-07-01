from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from enum import StrEnum
from typing import Any

from domain.events import (
    DomainEvent,
    KunstwerkBuitengebruikgesteld,
    KunstwerkGeregistreerd,
    OnderhoudseisenVastgesteld,
    OntwerpeisenVastgesteld,
)
from domain.exceptions import DomainError


class KunstwerkType(StrEnum):
    BRUG = "Brug"
    SLUIS = "Sluis"
    TUNNEL = "Tunnel"
    SNELWEG = "Snelweg"
    DIJK = "Dijk"
    GEMAAL = "Gemaal"
    STORMVLOEDKERING = "Stormvloedkering"


class KunstwerkStatus(StrEnum):
    GEREGISTREERD = "Geregistreerd"
    IN_GEBRUIK = "InGebruik"
    BUITEN_GEBRUIK = "BuitenGebruik"
    AFGEKEURD = "Afgekeurd"


class EisenSoort(StrEnum):
    ONDERHOUDSEISEN = "Onderhoudseisen"
    ONTWERPEISEN = "Ontwerpeisen"


class EisenpakketStatus(StrEnum):
    CONCEPT = "Concept"
    VASTGESTELD = "Vastgesteld"
    VERVANGEN = "Vervangen"


class RapportageType(StrEnum):
    NETWERKRAPPORTAGE = "Netwerkrapportage"
    ONDERHOUDSRAPPORT = "Onderhoudsrapport"


class RapportageResultaat(StrEnum):
    VOLDOET = "Voldoet"
    VOLDOET_NIET = "VoldoetNiet"
    NIET_TE_BEOORDELEN = "NietTeBeoordelen"


class BevindingResultaat(StrEnum):
    VOLDOET = "Voldoet"
    VOLDOET_NIET = "VoldoetNiet"
    NIET_TE_BEOORDELEN = "NietTeBeoordelen"


class EisOperator(StrEnum):
    KLEINER_DAN = "<"
    KLEINER_OF_GELIJK = "<="
    GROTER_DAN = ">"
    GROTER_OF_GELIJK = ">="
    GELIJK = "="


@dataclass(frozen=True, slots=True)
class KunstwerkId:
    waarde: str

    def __post_init__(self) -> None:
        if not self.waarde or not self.waarde.strip():
            raise DomainError("KunstwerkId is verplicht")

    def __str__(self) -> str:
        return self.waarde


@dataclass(frozen=True, slots=True)
class Locatie:
    waarde: str

    def __post_init__(self) -> None:
        if not self.waarde or not self.waarde.strip():
            raise DomainError("Locatie is verplicht")

    def __str__(self) -> str:
        return self.waarde


@dataclass(frozen=True, slots=True)
class Eis:
    code: str
    omschrijving: str
    meetwaarde: str
    operator: EisOperator
    grenswaarde: float
    eenheid: str

    def __post_init__(self) -> None:
        if not self.code.strip():
            raise DomainError("Eis.code is verplicht")
        if not self.omschrijving.strip():
            raise DomainError("Eis.omschrijving is verplicht")
        if not self.meetwaarde.strip():
            raise DomainError("Eis.meetwaarde is verplicht")
        if not self.eenheid.strip():
            raise DomainError("Eis.eenheid is verplicht")

    def as_event_data(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "omschrijving": self.omschrijving,
            "meetwaarde": self.meetwaarde,
            "operator": self.operator.value,
            "grenswaarde": self.grenswaarde,
            "eenheid": self.eenheid,
        }


@dataclass(slots=True)
class AggregateRoot:
    _events: list[DomainEvent] = field(default_factory=list, init=False, repr=False)

    def pull_events(self) -> list[DomainEvent]:
        events = list(self._events)
        self._events.clear()
        return events

    def _record(self, event: DomainEvent) -> None:
        self._events.append(event)


@dataclass(slots=True)
class Kunstwerk(AggregateRoot):
    kunstwerk_id: KunstwerkId
    naam: str
    type: KunstwerkType
    locatie: Locatie
    status: KunstwerkStatus
    aangemaakt_op: datetime
    gewijzigd_op: datetime
    beheerder: str | None = None
    jaar_renovatie: int | None = None
    laatste_inspectiedatum: date | None = None
    buitengebruik_reden: str | None = None
    buitengebruik_datum: date | None = None

    @classmethod
    def registreer(
        cls,
        kunstwerk_id: KunstwerkId,
        naam: str,
        type: KunstwerkType,
        locatie: Locatie,
        now: datetime,
        status: KunstwerkStatus = KunstwerkStatus.GEREGISTREERD,
        beheerder: str | None = None,
        jaar_renovatie: int | None = None,
        laatste_inspectiedatum: date | None = None,
    ) -> Kunstwerk:
        cls._validate_basisgegevens(naam, type, locatie, status)
        kunstwerk = cls(
            kunstwerk_id=kunstwerk_id,
            naam=naam.strip(),
            type=type,
            locatie=locatie,
            status=status,
            beheerder=_blank_to_none(beheerder),
            jaar_renovatie=jaar_renovatie,
            laatste_inspectiedatum=laatste_inspectiedatum,
            aangemaakt_op=now,
            gewijzigd_op=now,
        )
        kunstwerk._record(
            KunstwerkGeregistreerd(
                occurred_at=now,
                kunstwerk_id=str(kunstwerk_id),
                type=type.value,
                locatie=str(locatie),
                status=status.value,
            )
        )
        return kunstwerk

    def wijzig_basisgegevens(
        self,
        now: datetime,
        naam: str | None = None,
        type: KunstwerkType | None = None,
        locatie: Locatie | None = None,
        status: KunstwerkStatus | None = None,
        beheerder: str | None = None,
        jaar_renovatie: int | None = None,
        laatste_inspectiedatum: date | None = None,
    ) -> None:
        nieuwe_naam = self.naam if naam is None else naam.strip()
        nieuwe_type = self.type if type is None else type
        nieuwe_locatie = self.locatie if locatie is None else locatie
        nieuwe_status = self.status if status is None else status
        self._validate_basisgegevens(nieuwe_naam, nieuwe_type, nieuwe_locatie, nieuwe_status)

        self.naam = nieuwe_naam
        self.type = nieuwe_type
        self.locatie = nieuwe_locatie
        self.status = nieuwe_status
        if beheerder is not None:
            self.beheerder = _blank_to_none(beheerder)
        if jaar_renovatie is not None:
            self.jaar_renovatie = jaar_renovatie
        if laatste_inspectiedatum is not None:
            self.laatste_inspectiedatum = laatste_inspectiedatum
        self.gewijzigd_op = now

    def stel_buiten_gebruik(self, reden: str, datum: date, now: datetime) -> None:
        if self.status == KunstwerkStatus.BUITEN_GEBRUIK:
            raise DomainError("Kunstwerk is al buiten gebruik gesteld")
        if not reden.strip():
            raise DomainError("Buiten gebruik stellen vereist een reden")
        self.status = KunstwerkStatus.BUITEN_GEBRUIK
        self.buitengebruik_reden = reden.strip()
        self.buitengebruik_datum = datum
        self.gewijzigd_op = now
        self._record(
            KunstwerkBuitengebruikgesteld(
                occurred_at=now,
                kunstwerk_id=str(self.kunstwerk_id),
                reden=self.buitengebruik_reden,
                datum=datum,
            )
        )

    @staticmethod
    def _validate_basisgegevens(
        naam: str,
        type: KunstwerkType,
        locatie: Locatie,
        status: KunstwerkStatus,
    ) -> None:
        if not naam or not naam.strip():
            raise DomainError("Naam is verplicht")
        if type is None:
            raise DomainError("Type is verplicht")
        if locatie is None:
            raise DomainError("Locatie is verplicht")
        if status is None:
            raise DomainError("Status is verplicht")


@dataclass(slots=True)
class Eisenpakket(AggregateRoot):
    eisenpakket_id: str
    kunstwerk_id: KunstwerkId
    soort: EisenSoort
    versie: int
    status: EisenpakketStatus
    eisen: list[Eis]
    vastgesteld_op: datetime
    aangemaakt_op: datetime
    gewijzigd_op: datetime
    onderhoudsstrategie: str | None = None

    @classmethod
    def stel_vast(
        cls,
        eisenpakket_id: str,
        kunstwerk_id: KunstwerkId,
        soort: EisenSoort,
        versie: int,
        eisen: list[Eis],
        now: datetime,
        onderhoudsstrategie: str | None = None,
    ) -> Eisenpakket:
        if not eisenpakket_id.strip():
            raise DomainError("EisenpakketId is verplicht")
        if versie < 1:
            raise DomainError("Eisenpakket.versie moet minimaal 1 zijn")
        if not eisen:
            raise DomainError("Een vastgesteld eisenpakket bevat minimaal een eis")
        pakket = cls(
            eisenpakket_id=eisenpakket_id,
            kunstwerk_id=kunstwerk_id,
            soort=soort,
            versie=versie,
            status=EisenpakketStatus.VASTGESTELD,
            eisen=list(eisen),
            vastgesteld_op=now,
            aangemaakt_op=now,
            gewijzigd_op=now,
            onderhoudsstrategie=_blank_to_none(onderhoudsstrategie),
        )
        event_data = [eis.as_event_data() for eis in pakket.eisen]
        if soort == EisenSoort.ONDERHOUDSEISEN:
            pakket._record(
                OnderhoudseisenVastgesteld(
                    occurred_at=now,
                    kunstwerk_id=str(kunstwerk_id),
                    eisen=event_data,
                )
            )
        else:
            pakket._record(
                OntwerpeisenVastgesteld(
                    occurred_at=now,
                    kunstwerk_id=str(kunstwerk_id),
                    eisen=event_data,
                )
            )
        return pakket

    def markeer_vervangen(self, now: datetime) -> None:
        if self.status == EisenpakketStatus.VERVANGEN:
            return
        self.status = EisenpakketStatus.VERVANGEN
        self.gewijzigd_op = now


@dataclass(frozen=True, slots=True)
class RapportageBevinding:
    eis_code: str | None
    meetwaarde: float | None
    operator: str | None
    grenswaarde: float | None
    eenheid: str | None
    resultaat: BevindingResultaat
    toelichting: str


@dataclass(slots=True)
class RapportageBeoordeling(AggregateRoot):
    beoordeling_id: str
    extern_rapport_id: str
    bron_event_id: str
    kunstwerk_id: KunstwerkId
    rapportage_type: RapportageType
    ontvangen_op: datetime
    eisenpakket_id: str | None
    resultaat: RapportageResultaat
    bevindingen: list[RapportageBevinding]
    aangemaakt_op: datetime

    @classmethod
    def registreer(
        cls,
        beoordeling_id: str,
        extern_rapport_id: str,
        bron_event_id: str,
        kunstwerk_id: KunstwerkId,
        rapportage_type: RapportageType,
        ontvangen_op: datetime,
        eisenpakket_id: str | None,
        resultaat: RapportageResultaat,
        bevindingen: list[RapportageBevinding],
        now: datetime,
    ) -> RapportageBeoordeling:
        if not beoordeling_id.strip():
            raise DomainError("BeoordelingId is verplicht")
        if not extern_rapport_id.strip():
            raise DomainError("Extern rapport ID is verplicht")
        if not bron_event_id.strip():
            raise DomainError("Bron event ID is verplicht")
        return cls(
            beoordeling_id=beoordeling_id,
            extern_rapport_id=extern_rapport_id,
            bron_event_id=bron_event_id,
            kunstwerk_id=kunstwerk_id,
            rapportage_type=rapportage_type,
            ontvangen_op=ontvangen_op,
            eisenpakket_id=eisenpakket_id,
            resultaat=resultaat,
            bevindingen=list(bevindingen),
            aangemaakt_op=now,
        )


def _blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None
