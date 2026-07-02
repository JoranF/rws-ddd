from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from application.dto import RegistreerKunstwerkCommand, StelEisenVastCommand
from application.use_cases import BeheerQueries, RegistreerKunstwerk, StelOnderhoudseisenVast
from domain.model import Eis, EisOperator, EisenSoort, KunstwerkType
from infrastructure.db import Base
from infrastructure.uow import SqlAlchemyUnitOfWork
from tests.fakes import FakePublisher, FixedClock, SequenceIdGenerator

import infrastructure.models  # noqa: F401


def _session_factory() -> sessionmaker:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)


def test_sqlalchemy_unit_of_work_persisteert_kunstwerk_en_eisenpakket() -> None:
    session_factory = _session_factory()
    publisher = FakePublisher()
    clock = FixedClock()
    ids = SequenceIdGenerator()

    def uow() -> SqlAlchemyUnitOfWork:
        return SqlAlchemyUnitOfWork(session_factory)

    kunstwerk = RegistreerKunstwerk(uow(), publisher, clock, ids)(
        RegistreerKunstwerkCommand(
            naam="Sluis Integratie",
            type=KunstwerkType.SLUIS,
            locatie="IJmuiden",
        )
    )
    StelOnderhoudseisenVast(uow(), publisher, clock, ids)(
        StelEisenVastCommand(
            kunstwerk_id=str(kunstwerk.kunstwerk_id),
            eisen=[
                Eis(
                    code="CORROSIE",
                    omschrijving="Corrosiescore minimaal",
                    meetwaarde="corrosiescore",
                    operator=EisOperator.GROTER_OF_GELIJK,
                    grenswaarde=7.0,
                    eenheid="score",
                )
            ],
        )
    )

    queries = BeheerQueries(uow())
    opgeslagen_kunstwerk = queries.get_kunstwerk(str(kunstwerk.kunstwerk_id))
    laatste_eisen = queries.get_laatste_eisen(
        str(kunstwerk.kunstwerk_id),
        EisenSoort.ONDERHOUDSEISEN,
    )

    assert opgeslagen_kunstwerk.naam == "Sluis Integratie"
    assert laatste_eisen.versie == 1
    assert laatste_eisen.eisen[0].code == "CORROSIE"
    assert [event.event_type for event in publisher.events] == [
        "beheer.kunstwerk.geregistreerd",
        "beheer.onderhoudseisen.vastgesteld",
    ]
