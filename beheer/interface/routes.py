from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from fastapi import APIRouter, Depends, HTTPException, Response, status

from application.dto import (
    RegistreerKunstwerkCommand,
    StelEisenVastCommand,
    StelKunstwerkBuitenGebruikCommand,
    WijzigKunstwerkBasisgegevensCommand,
)
from application.errors import ConflictError, NotFoundError
from application.use_cases import (
    BeheerQueries,
    RegistreerKunstwerk,
    StelKunstwerkBuitenGebruik,
    StelOnderhoudseisenVast,
    StelOntwerpeisenVast,
    WijzigKunstwerkBasisgegevens,
)
from domain.exceptions import DomainError
from domain.model import EisenSoort, RapportageType
from interface.schemas import (
    BuitenGebruikstellingRequest,
    EisenpakketResponse,
    KunstwerkResponse,
    RapportageBeoordelingResponse,
    RegistreerKunstwerkRequest,
    StelEisenVastRequest,
    WijzigKunstwerkRequest,
    beoordeling_response,
    eisenpakket_response,
    kunstwerk_response,
)


@dataclass(frozen=True, slots=True)
class RouteServices:
    registreer_kunstwerk: Callable[[], RegistreerKunstwerk]
    wijzig_kunstwerk: Callable[[], WijzigKunstwerkBasisgegevens]
    stel_buiten_gebruik: Callable[[], StelKunstwerkBuitenGebruik]
    stel_onderhoudseisen_vast: Callable[[], StelOnderhoudseisenVast]
    stel_ontwerpeisen_vast: Callable[[], StelOntwerpeisenVast]
    queries: Callable[[], BeheerQueries]
    # Optionele auth-dependency; standaard geen (auth wordt in main.py bekabeld).
    # Wordt op router-niveau toegepast zodat alle /api-routes beschermd zijn.
    auth_dependency: Callable[..., object] | None = None


def create_router(services: RouteServices) -> APIRouter:
    dependencies = [Depends(services.auth_dependency)] if services.auth_dependency else []
    router = APIRouter(prefix="/api", tags=["beheer"], dependencies=dependencies)

    @router.post(
        "/kunstwerken",
        response_model=KunstwerkResponse,
        status_code=status.HTTP_201_CREATED,
    )
    def registreer_kunstwerk(request: RegistreerKunstwerkRequest) -> KunstwerkResponse:
        return _handle(
            lambda: kunstwerk_response(
                services.registreer_kunstwerk()(
                    RegistreerKunstwerkCommand(
                        kunstwerk_id=request.kunstwerkId,
                        naam=request.naam,
                        type=request.type,
                        locatie=request.locatie,
                        status=request.status,
                        beheerder=request.beheerder,
                        jaar_renovatie=request.jaarRenovatie,
                        laatste_inspectiedatum=request.laatsteInspectiedatum,
                    )
                )
            )
        )

    @router.get("/kunstwerken", response_model=list[KunstwerkResponse])
    def zoek_kunstwerken() -> list[KunstwerkResponse]:
        return [kunstwerk_response(item) for item in services.queries().zoek_kunstwerken()]

    @router.get("/kunstwerken/{kunstwerk_id}", response_model=KunstwerkResponse)
    def get_kunstwerk(kunstwerk_id: str) -> KunstwerkResponse:
        return _handle(lambda: kunstwerk_response(services.queries().get_kunstwerk(kunstwerk_id)))

    @router.patch("/kunstwerken/{kunstwerk_id}", response_model=KunstwerkResponse)
    def wijzig_kunstwerk(
        kunstwerk_id: str,
        request: WijzigKunstwerkRequest,
    ) -> KunstwerkResponse:
        return _handle(
            lambda: kunstwerk_response(
                services.wijzig_kunstwerk()(
                    WijzigKunstwerkBasisgegevensCommand(
                        kunstwerk_id=kunstwerk_id,
                        naam=request.naam,
                        type=request.type,
                        locatie=request.locatie,
                        status=request.status,
                        beheerder=request.beheerder,
                        jaar_renovatie=request.jaarRenovatie,
                        laatste_inspectiedatum=request.laatsteInspectiedatum,
                    )
                )
            )
        )

    @router.post(
        "/kunstwerken/{kunstwerk_id}/buitengebruikstelling",
        response_model=KunstwerkResponse,
    )
    def stel_buiten_gebruik(
        kunstwerk_id: str,
        request: BuitenGebruikstellingRequest,
    ) -> KunstwerkResponse:
        return _handle(
            lambda: kunstwerk_response(
                services.stel_buiten_gebruik()(
                    StelKunstwerkBuitenGebruikCommand(
                        kunstwerk_id=kunstwerk_id,
                        reden=request.reden,
                        datum=request.datum,
                    )
                )
            )
        )

    @router.post(
        "/kunstwerken/{kunstwerk_id}/onderhoudseisen",
        response_model=EisenpakketResponse,
        status_code=status.HTTP_201_CREATED,
    )
    def stel_onderhoudseisen_vast(
        kunstwerk_id: str,
        request: StelEisenVastRequest,
    ) -> EisenpakketResponse:
        return _handle(
            lambda: eisenpakket_response(
                services.stel_onderhoudseisen_vast()(
                    StelEisenVastCommand(
                        kunstwerk_id=kunstwerk_id,
                        eisen=[eis.to_domain() for eis in request.eisen],
                        onderhoudsstrategie=request.onderhoudsstrategie,
                    )
                )
            )
        )

    @router.post(
        "/kunstwerken/{kunstwerk_id}/ontwerpeisen",
        response_model=EisenpakketResponse,
        status_code=status.HTTP_201_CREATED,
    )
    def stel_ontwerpeisen_vast(
        kunstwerk_id: str,
        request: StelEisenVastRequest,
    ) -> EisenpakketResponse:
        return _handle(
            lambda: eisenpakket_response(
                services.stel_ontwerpeisen_vast()(
                    StelEisenVastCommand(
                        kunstwerk_id=kunstwerk_id,
                        eisen=[eis.to_domain() for eis in request.eisen],
                        onderhoudsstrategie=request.onderhoudsstrategie,
                    )
                )
            )
        )

    @router.get("/kunstwerken/{kunstwerk_id}/eisen", response_model=list[EisenpakketResponse])
    def get_eisen_voor_kunstwerk(kunstwerk_id: str) -> list[EisenpakketResponse]:
        return _handle(
            lambda: [
                eisenpakket_response(item)
                for item in services.queries().get_eisen_voor_kunstwerk(kunstwerk_id)
            ]
        )

    @router.get("/kunstwerken/{kunstwerk_id}/onderhoudseisen", response_model=EisenpakketResponse)
    def get_laatste_onderhoudseisen(kunstwerk_id: str) -> EisenpakketResponse:
        return _handle(
            lambda: eisenpakket_response(
                services.queries().get_laatste_eisen(
                    kunstwerk_id,
                    EisenSoort.ONDERHOUDSEISEN,
                )
            )
        )

    @router.get("/kunstwerken/{kunstwerk_id}/ontwerpeisen", response_model=EisenpakketResponse)
    def get_laatste_ontwerpeisen(kunstwerk_id: str) -> EisenpakketResponse:
        return _handle(
            lambda: eisenpakket_response(
                services.queries().get_laatste_eisen(kunstwerk_id, EisenSoort.ONTWERPEISEN)
            )
        )

    @router.get(
        "/rapportage-beoordelingen",
        response_model=list[RapportageBeoordelingResponse],
    )
    def zoek_rapportage_beoordelingen(
        kunstwerkId: str | None = None,
        rapportageType: RapportageType | None = None,
    ) -> list[RapportageBeoordelingResponse]:
        return _handle(
            lambda: [
                beoordeling_response(item)
                for item in services.queries().zoek_rapportage_beoordelingen(
                    kunstwerk_id=kunstwerkId,
                    rapportage_type=rapportageType,
                )
            ]
        )

    @router.get(
        "/rapportage-beoordelingen/{beoordeling_id}",
        response_model=RapportageBeoordelingResponse,
    )
    def get_rapportage_beoordeling(beoordeling_id: str) -> RapportageBeoordelingResponse:
        return _handle(
            lambda: beoordeling_response(
                services.queries().get_rapportage_beoordeling(beoordeling_id)
            )
        )

    return router


def health_response(check_health: Callable[[], dict[str, str]]) -> APIRouter:
    router = APIRouter(tags=["health"])

    @router.get("/health")
    def health(response: Response) -> dict[str, str]:
        result = check_health()
        if any(value != "ok" for value in result.values()):
            response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return result

    return router


def _handle(call: Callable[[], object]):
    try:
        return call()
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except DomainError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
