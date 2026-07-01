from __future__ import annotations

from domain.exceptions import DomainError
from domain.model import (
    EisenSoort,
    Eisenpakket,
    Kunstwerk,
    KunstwerkId,
    Locatie,
    RapportageBeoordeling,
    RapportageType,
)
from domain.services import EisenValidator

from application.dto import (
    RegistreerKunstwerkCommand,
    StelEisenVastCommand,
    StelKunstwerkBuitenGebruikCommand,
    VerwerkRapportCommand,
    WijzigKunstwerkBasisgegevensCommand,
)
from application.errors import ConflictError, NotFoundError
from application.ports import Clock, EventPublisher, IdGenerator, UnitOfWork


class RegistreerKunstwerk:
    def __init__(
        self,
        uow: UnitOfWork,
        publisher: EventPublisher,
        clock: Clock,
        id_generator: IdGenerator,
    ) -> None:
        self.uow = uow
        self.publisher = publisher
        self.clock = clock
        self.id_generator = id_generator

    def __call__(self, command: RegistreerKunstwerkCommand) -> Kunstwerk:
        now = self.clock.now()
        kunstwerk_id = KunstwerkId(command.kunstwerk_id or self.id_generator.new_id())
        with self.uow:
            if self.uow.kunstwerken.get(kunstwerk_id) is not None:
                raise ConflictError(f"Kunstwerk '{kunstwerk_id}' bestaat al")
            kunstwerk = Kunstwerk.registreer(
                kunstwerk_id=kunstwerk_id,
                naam=command.naam,
                type=command.type,
                locatie=Locatie(command.locatie),
                status=command.status,
                beheerder=command.beheerder,
                jaar_renovatie=command.jaar_renovatie,
                laatste_inspectiedatum=command.laatste_inspectiedatum,
                now=now,
            )
            self.uow.kunstwerken.add(kunstwerk)
            events = kunstwerk.pull_events()
            self.uow.commit()
        self.publisher.publish(events)
        return kunstwerk


class WijzigKunstwerkBasisgegevens:
    def __init__(self, uow: UnitOfWork, clock: Clock) -> None:
        self.uow = uow
        self.clock = clock

    def __call__(self, command: WijzigKunstwerkBasisgegevensCommand) -> Kunstwerk:
        kunstwerk_id = KunstwerkId(command.kunstwerk_id)
        with self.uow:
            kunstwerk = self.uow.kunstwerken.get(kunstwerk_id)
            if kunstwerk is None:
                raise NotFoundError(f"Kunstwerk '{kunstwerk_id}' niet gevonden")
            kunstwerk.wijzig_basisgegevens(
                now=self.clock.now(),
                naam=command.naam,
                type=command.type,
                locatie=Locatie(command.locatie) if command.locatie is not None else None,
                status=command.status,
                beheerder=command.beheerder,
                jaar_renovatie=command.jaar_renovatie,
                laatste_inspectiedatum=command.laatste_inspectiedatum,
            )
            self.uow.kunstwerken.save(kunstwerk)
            self.uow.commit()
            return kunstwerk


class StelKunstwerkBuitenGebruik:
    def __init__(self, uow: UnitOfWork, publisher: EventPublisher, clock: Clock) -> None:
        self.uow = uow
        self.publisher = publisher
        self.clock = clock

    def __call__(self, command: StelKunstwerkBuitenGebruikCommand) -> Kunstwerk:
        kunstwerk_id = KunstwerkId(command.kunstwerk_id)
        with self.uow:
            kunstwerk = self.uow.kunstwerken.get(kunstwerk_id)
            if kunstwerk is None:
                raise NotFoundError(f"Kunstwerk '{kunstwerk_id}' niet gevonden")
            try:
                kunstwerk.stel_buiten_gebruik(
                    reden=command.reden,
                    datum=command.datum,
                    now=self.clock.now(),
                )
            except DomainError as exc:
                raise ConflictError(str(exc)) from exc
            self.uow.kunstwerken.save(kunstwerk)
            events = kunstwerk.pull_events()
            self.uow.commit()
        self.publisher.publish(events)
        return kunstwerk


class StelOnderhoudseisenVast:
    def __init__(
        self,
        uow: UnitOfWork,
        publisher: EventPublisher,
        clock: Clock,
        id_generator: IdGenerator,
    ) -> None:
        self.uow = uow
        self.publisher = publisher
        self.clock = clock
        self.id_generator = id_generator

    def __call__(self, command: StelEisenVastCommand) -> Eisenpakket:
        return _stel_eisen_vast(
            command=command,
            soort=EisenSoort.ONDERHOUDSEISEN,
            uow=self.uow,
            publisher=self.publisher,
            clock=self.clock,
            id_generator=self.id_generator,
        )


class StelOntwerpeisenVast:
    def __init__(
        self,
        uow: UnitOfWork,
        publisher: EventPublisher,
        clock: Clock,
        id_generator: IdGenerator,
    ) -> None:
        self.uow = uow
        self.publisher = publisher
        self.clock = clock
        self.id_generator = id_generator

    def __call__(self, command: StelEisenVastCommand) -> Eisenpakket:
        return _stel_eisen_vast(
            command=command,
            soort=EisenSoort.ONTWERPEISEN,
            uow=self.uow,
            publisher=self.publisher,
            clock=self.clock,
            id_generator=self.id_generator,
        )


def _stel_eisen_vast(
    command: StelEisenVastCommand,
    soort: EisenSoort,
    uow: UnitOfWork,
    publisher: EventPublisher,
    clock: Clock,
    id_generator: IdGenerator,
) -> Eisenpakket:
    now = clock.now()
    kunstwerk_id = KunstwerkId(command.kunstwerk_id)
    with uow:
        if uow.kunstwerken.get(kunstwerk_id) is None:
            raise NotFoundError(f"Kunstwerk '{kunstwerk_id}' niet gevonden")
        current = uow.eisenpakketten.get_current(kunstwerk_id, soort)
        if current is not None:
            current.markeer_vervangen(now)
            uow.eisenpakketten.save(current)
        versie = uow.eisenpakketten.next_version(kunstwerk_id, soort)
        pakket = Eisenpakket.stel_vast(
            eisenpakket_id=id_generator.new_id(),
            kunstwerk_id=kunstwerk_id,
            soort=soort,
            versie=versie,
            eisen=command.eisen,
            now=now,
            onderhoudsstrategie=command.onderhoudsstrategie,
        )
        uow.eisenpakketten.add(pakket)
        events = pakket.pull_events()
        uow.commit()
    publisher.publish(events)
    return pakket


class VerwerkMonitoringRapport:
    def __init__(
        self,
        uow: UnitOfWork,
        validator: EisenValidator,
        clock: Clock,
        id_generator: IdGenerator,
    ) -> None:
        self.uow = uow
        self.validator = validator
        self.clock = clock
        self.id_generator = id_generator

    def __call__(self, command: VerwerkRapportCommand) -> RapportageBeoordeling:
        return _verwerk_rapport(
            command=command,
            rapportage_type=RapportageType.NETWERKRAPPORTAGE,
            eisen_soort=EisenSoort.ONTWERPEISEN,
            uow=self.uow,
            validator=self.validator,
            clock=self.clock,
            id_generator=self.id_generator,
        )


class VerwerkOnderhoudAfgerond:
    def __init__(
        self,
        uow: UnitOfWork,
        validator: EisenValidator,
        clock: Clock,
        id_generator: IdGenerator,
    ) -> None:
        self.uow = uow
        self.validator = validator
        self.clock = clock
        self.id_generator = id_generator

    def __call__(self, command: VerwerkRapportCommand) -> RapportageBeoordeling:
        return _verwerk_rapport(
            command=command,
            rapportage_type=RapportageType.ONDERHOUDSRAPPORT,
            eisen_soort=EisenSoort.ONDERHOUDSEISEN,
            uow=self.uow,
            validator=self.validator,
            clock=self.clock,
            id_generator=self.id_generator,
        )


def _verwerk_rapport(
    command: VerwerkRapportCommand,
    rapportage_type: RapportageType,
    eisen_soort: EisenSoort,
    uow: UnitOfWork,
    validator: EisenValidator,
    clock: Clock,
    id_generator: IdGenerator,
) -> RapportageBeoordeling:
    now = clock.now()
    kunstwerk_id = KunstwerkId(command.kunstwerk_id)
    with uow:
        existing = uow.beoordelingen.get_by_bron_event_id(command.bron_event_id)
        if existing is not None:
            return existing
        if uow.verwerkte_events.has(command.bron_event_id):
            existing = uow.beoordelingen.get_by_bron_event_id(command.bron_event_id)
            if existing is not None:
                return existing
            raise ConflictError(f"Event '{command.bron_event_id}' is al verwerkt")
        if uow.kunstwerken.get(kunstwerk_id) is None:
            raise NotFoundError(f"Kunstwerk '{kunstwerk_id}' niet gevonden")

        eisenpakket = uow.eisenpakketten.get_current(kunstwerk_id, eisen_soort)
        resultaat, bevindingen = validator.beoordeel(eisenpakket, command.rapportwaarden)
        beoordeling = RapportageBeoordeling.registreer(
            beoordeling_id=id_generator.new_id(),
            extern_rapport_id=command.extern_rapport_id,
            bron_event_id=command.bron_event_id,
            kunstwerk_id=kunstwerk_id,
            rapportage_type=rapportage_type,
            ontvangen_op=command.occurred_at,
            eisenpakket_id=eisenpakket.eisenpakket_id if eisenpakket else None,
            resultaat=resultaat,
            bevindingen=bevindingen,
            now=now,
        )
        uow.beoordelingen.add(beoordeling)
        uow.verwerkte_events.add(
            event_id=command.bron_event_id,
            event_type=command.event_type,
            occurred_at=command.occurred_at,
            processed_at=now,
        )
        uow.commit()
        return beoordeling


class BeheerQueries:
    def __init__(self, uow: UnitOfWork) -> None:
        self.uow = uow

    def zoek_kunstwerken(self) -> list[Kunstwerk]:
        with self.uow:
            return self.uow.kunstwerken.list()

    def get_kunstwerk(self, kunstwerk_id: str) -> Kunstwerk:
        with self.uow:
            kunstwerk = self.uow.kunstwerken.get(KunstwerkId(kunstwerk_id))
            if kunstwerk is None:
                raise NotFoundError(f"Kunstwerk '{kunstwerk_id}' niet gevonden")
            return kunstwerk

    def get_eisen_voor_kunstwerk(
        self,
        kunstwerk_id: str,
        soort: EisenSoort | None = None,
    ) -> list[Eisenpakket]:
        with self.uow:
            pakket = self.uow.eisenpakketten.list_for_kunstwerk(KunstwerkId(kunstwerk_id), soort)
            return pakket

    def get_laatste_eisen(self, kunstwerk_id: str, soort: EisenSoort) -> Eisenpakket:
        with self.uow:
            pakket = self.uow.eisenpakketten.get_current(KunstwerkId(kunstwerk_id), soort)
            if pakket is None:
                raise NotFoundError(
                    f"Geen huidig {soort.value} gevonden voor kunstwerk '{kunstwerk_id}'"
                )
            return pakket

    def zoek_rapportage_beoordelingen(
        self,
        kunstwerk_id: str | None = None,
        rapportage_type: RapportageType | None = None,
    ) -> list[RapportageBeoordeling]:
        with self.uow:
            return self.uow.beoordelingen.list(
                KunstwerkId(kunstwerk_id) if kunstwerk_id else None,
                rapportage_type,
            )

    def get_rapportage_beoordeling(self, beoordeling_id: str) -> RapportageBeoordeling:
        with self.uow:
            beoordeling = self.uow.beoordelingen.get(beoordeling_id)
            if beoordeling is None:
                raise NotFoundError(f"RapportageBeoordeling '{beoordeling_id}' niet gevonden")
            return beoordeling
