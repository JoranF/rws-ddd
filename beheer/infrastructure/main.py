from __future__ import annotations

import logging

from fastapi import FastAPI

from application.use_cases import (
    BeheerQueries,
    RegistreerKunstwerk,
    StelKunstwerkBuitenGebruik,
    StelOnderhoudseisenVast,
    StelOntwerpeisenVast,
    VerwerkMonitoringRapport,
    VerwerkOnderhoudAfgerond,
    WijzigKunstwerkBasisgegevens,
)
from domain.services import EisenValidator
from infrastructure.config import get_settings
from infrastructure.db import SessionLocal, check_database
from infrastructure.rabbitmq import RabbitMqEventPublisher, check_rabbitmq
from infrastructure.rabbitmq_consumer import RabbitMqConsumerRunner
from infrastructure.runtime import SystemClock, UuidGenerator
from infrastructure.uow import SqlAlchemyUnitOfWork
from interface.routes import RouteServices, create_router, health_response

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    settings = get_settings()
    clock = SystemClock()
    id_generator = UuidGenerator()
    publisher = RabbitMqEventPublisher(settings.rabbitmq_url, settings.rabbitmq_exchange)

    def uow() -> SqlAlchemyUnitOfWork:
        return SqlAlchemyUnitOfWork(SessionLocal)

    def registreer_kunstwerk() -> RegistreerKunstwerk:
        return RegistreerKunstwerk(uow(), publisher, clock, id_generator)

    def wijzig_kunstwerk() -> WijzigKunstwerkBasisgegevens:
        return WijzigKunstwerkBasisgegevens(uow(), clock)

    def stel_buiten_gebruik() -> StelKunstwerkBuitenGebruik:
        return StelKunstwerkBuitenGebruik(uow(), publisher, clock)

    def stel_onderhoudseisen_vast() -> StelOnderhoudseisenVast:
        return StelOnderhoudseisenVast(uow(), publisher, clock, id_generator)

    def stel_ontwerpeisen_vast() -> StelOntwerpeisenVast:
        return StelOntwerpeisenVast(uow(), publisher, clock, id_generator)

    def queries() -> BeheerQueries:
        return BeheerQueries(uow())

    def verwerk_monitoring_rapport() -> VerwerkMonitoringRapport:
        return VerwerkMonitoringRapport(uow(), EisenValidator(), clock, id_generator)

    def verwerk_onderhoud_afgerond() -> VerwerkOnderhoudAfgerond:
        return VerwerkOnderhoudAfgerond(uow(), EisenValidator(), clock, id_generator)

    app = FastAPI(
        title="RWS Beheer API",
        version="0.1.0",
        description="Kunstwerk-register, eisen en rapportagebeoordelingen voor Beheer.",
    )
    app.include_router(
        create_router(
            RouteServices(
                registreer_kunstwerk=registreer_kunstwerk,
                wijzig_kunstwerk=wijzig_kunstwerk,
                stel_buiten_gebruik=stel_buiten_gebruik,
                stel_onderhoudseisen_vast=stel_onderhoudseisen_vast,
                stel_ontwerpeisen_vast=stel_ontwerpeisen_vast,
                queries=queries,
            )
        )
    )
    app.include_router(health_response(lambda: _health(settings.rabbitmq_url)))

    @app.on_event("startup")
    def start_consumers() -> None:
        if not settings.enable_consumers:
            return
        runner = RabbitMqConsumerRunner(
            rabbitmq_url=settings.rabbitmq_url,
            exchange=settings.rabbitmq_exchange,
            monitoring_factory=verwerk_monitoring_rapport,
            onderhoud_factory=verwerk_onderhoud_afgerond,
        )
        runner.start()
        app.state.rabbitmq_consumer_runner = runner

    return app


def _health(rabbitmq_url: str) -> dict[str, str]:
    result = {"service": "ok", "database": "ok", "broker": "ok"}
    try:
        check_database()
    except Exception:
        logger.exception("Database healthcheck faalde")
        result["database"] = "unavailable"
    try:
        check_rabbitmq(rabbitmq_url)
    except Exception:
        logger.exception("RabbitMQ healthcheck faalde")
        result["broker"] = "unavailable"
    return result


app = create_app()
