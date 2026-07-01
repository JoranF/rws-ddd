from __future__ import annotations

from collections.abc import Callable

from sqlalchemy.orm import Session

from infrastructure.repositories import (
    SqlAlchemyEisenpakketRepository,
    SqlAlchemyKunstwerkRepository,
    SqlAlchemyRapportageBeoordelingRepository,
    SqlAlchemyVerwerktEventRepository,
)


class SqlAlchemyUnitOfWork:
    def __init__(self, session_factory: Callable[[], Session]) -> None:
        self.session_factory = session_factory

    def __enter__(self) -> SqlAlchemyUnitOfWork:
        self.session = self.session_factory()
        self.kunstwerken = SqlAlchemyKunstwerkRepository(self.session)
        self.eisenpakketten = SqlAlchemyEisenpakketRepository(self.session)
        self.beoordelingen = SqlAlchemyRapportageBeoordelingRepository(self.session)
        self.verwerkte_events = SqlAlchemyVerwerktEventRepository(self.session)
        return self

    def __exit__(self, exc_type: object, exc: object, tb: object) -> None:
        if exc_type is not None:
            self.rollback()
        self.session.close()

    def commit(self) -> None:
        self.session.commit()

    def rollback(self) -> None:
        self.session.rollback()
