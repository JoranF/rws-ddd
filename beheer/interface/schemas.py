from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field

from domain.model import (
    Eis,
    EisOperator,
    Eisenpakket,
    Kunstwerk,
    KunstwerkStatus,
    KunstwerkType,
    RapportageBeoordeling,
)


class ApiModel(BaseModel):
    pass


class RegistreerKunstwerkRequest(ApiModel):
    kunstwerkId: str | None = None
    naam: str
    type: KunstwerkType
    locatie: str
    status: KunstwerkStatus = KunstwerkStatus.GEREGISTREERD
    beheerder: str | None = None
    jaarRenovatie: int | None = None
    laatsteInspectiedatum: date | None = None


class WijzigKunstwerkRequest(ApiModel):
    naam: str | None = None
    type: KunstwerkType | None = None
    locatie: str | None = None
    status: KunstwerkStatus | None = None
    beheerder: str | None = None
    jaarRenovatie: int | None = None
    laatsteInspectiedatum: date | None = None


class BuitenGebruikstellingRequest(ApiModel):
    reden: str
    datum: date


class EisRequest(ApiModel):
    code: str
    omschrijving: str
    meetwaarde: str
    operator: EisOperator
    grenswaarde: float
    eenheid: str

    def to_domain(self) -> Eis:
        return Eis(
            code=self.code,
            omschrijving=self.omschrijving,
            meetwaarde=self.meetwaarde,
            operator=EisOperator(self.operator),
            grenswaarde=self.grenswaarde,
            eenheid=self.eenheid,
        )


class StelEisenVastRequest(ApiModel):
    eisen: list[EisRequest] = Field(min_length=1)
    onderhoudsstrategie: str | None = None


class EisResponse(ApiModel):
    code: str
    omschrijving: str
    meetwaarde: str
    operator: str
    grenswaarde: float
    eenheid: str


class KunstwerkResponse(ApiModel):
    kunstwerkId: str
    naam: str
    type: str
    locatie: str
    status: str
    beheerder: str | None
    jaarRenovatie: int | None
    laatsteInspectiedatum: date | None
    buitengebruikReden: str | None
    buitengebruikDatum: date | None
    aangemaaktOp: datetime
    gewijzigdOp: datetime


class EisenpakketResponse(ApiModel):
    eisenpakketId: str
    kunstwerkId: str
    soort: str
    versie: int
    status: str
    eisen: list[EisResponse]
    vastgesteldOp: datetime
    onderhoudsstrategie: str | None


class RapportageBevindingResponse(ApiModel):
    eisCode: str | None
    meetwaarde: float | None
    operator: str | None
    grenswaarde: float | None
    eenheid: str | None
    resultaat: str
    toelichting: str


class RapportageBeoordelingResponse(ApiModel):
    beoordelingId: str
    externRapportId: str
    bronEventId: str
    kunstwerkId: str
    rapportageType: str
    ontvangenOp: datetime
    eisenpakketId: str | None
    resultaat: str
    bevindingen: list[RapportageBevindingResponse]


def kunstwerk_response(kunstwerk: Kunstwerk) -> KunstwerkResponse:
    return KunstwerkResponse(
        kunstwerkId=str(kunstwerk.kunstwerk_id),
        naam=kunstwerk.naam,
        type=kunstwerk.type.value,
        locatie=str(kunstwerk.locatie),
        status=kunstwerk.status.value,
        beheerder=kunstwerk.beheerder,
        jaarRenovatie=kunstwerk.jaar_renovatie,
        laatsteInspectiedatum=kunstwerk.laatste_inspectiedatum,
        buitengebruikReden=kunstwerk.buitengebruik_reden,
        buitengebruikDatum=kunstwerk.buitengebruik_datum,
        aangemaaktOp=kunstwerk.aangemaakt_op,
        gewijzigdOp=kunstwerk.gewijzigd_op,
    )


def eisenpakket_response(eisenpakket: Eisenpakket) -> EisenpakketResponse:
    return EisenpakketResponse(
        eisenpakketId=eisenpakket.eisenpakket_id,
        kunstwerkId=str(eisenpakket.kunstwerk_id),
        soort=eisenpakket.soort.value,
        versie=eisenpakket.versie,
        status=eisenpakket.status.value,
        onderhoudsstrategie=eisenpakket.onderhoudsstrategie,
        vastgesteldOp=eisenpakket.vastgesteld_op,
        eisen=[
            EisResponse(
                code=eis.code,
                omschrijving=eis.omschrijving,
                meetwaarde=eis.meetwaarde,
                operator=eis.operator.value,
                grenswaarde=eis.grenswaarde,
                eenheid=eis.eenheid,
            )
            for eis in eisenpakket.eisen
        ],
    )


def beoordeling_response(beoordeling: RapportageBeoordeling) -> RapportageBeoordelingResponse:
    return RapportageBeoordelingResponse(
        beoordelingId=beoordeling.beoordeling_id,
        externRapportId=beoordeling.extern_rapport_id,
        bronEventId=beoordeling.bron_event_id,
        kunstwerkId=str(beoordeling.kunstwerk_id),
        rapportageType=beoordeling.rapportage_type.value,
        ontvangenOp=beoordeling.ontvangen_op,
        eisenpakketId=beoordeling.eisenpakket_id,
        resultaat=beoordeling.resultaat.value,
        bevindingen=[
            RapportageBevindingResponse(
                eisCode=bevinding.eis_code,
                meetwaarde=bevinding.meetwaarde,
                operator=bevinding.operator,
                grenswaarde=bevinding.grenswaarde,
                eenheid=bevinding.eenheid,
                resultaat=bevinding.resultaat.value,
                toelichting=bevinding.toelichting,
            )
            for bevinding in beoordeling.bevindingen
        ],
    )
