from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from domain.model import (
    BevindingResultaat,
    Eis,
    EisOperator,
    EisenSoort,
    Eisenpakket,
    EisenpakketStatus,
    Kunstwerk,
    KunstwerkId,
    KunstwerkStatus,
    KunstwerkType,
    Locatie,
    RapportageBeoordeling,
    RapportageBevinding,
    RapportageResultaat,
    RapportageType,
)

from infrastructure.models import (
    EisModel,
    EisenpakketModel,
    KunstwerkModel,
    RapportageBeoordelingModel,
    RapportageBevindingModel,
    VerwerktEventModel,
)


class SqlAlchemyKunstwerkRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, kunstwerk: Kunstwerk) -> None:
        self.session.add(_kunstwerk_to_model(kunstwerk))

    def save(self, kunstwerk: Kunstwerk) -> None:
        model = self.session.get(KunstwerkModel, str(kunstwerk.kunstwerk_id))
        if model is None:
            self.add(kunstwerk)
            return
        _update_kunstwerk_model(model, kunstwerk)

    def get(self, kunstwerk_id: KunstwerkId) -> Kunstwerk | None:
        model = self.session.get(KunstwerkModel, str(kunstwerk_id))
        return _model_to_kunstwerk(model) if model else None

    def list(self) -> list[Kunstwerk]:
        models = self.session.scalars(select(KunstwerkModel).order_by(KunstwerkModel.id)).all()
        return [_model_to_kunstwerk(model) for model in models]


class SqlAlchemyEisenpakketRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, eisenpakket: Eisenpakket) -> None:
        self.session.add(_eisenpakket_to_model(eisenpakket))

    def save(self, eisenpakket: Eisenpakket) -> None:
        model = self.session.get(EisenpakketModel, eisenpakket.eisenpakket_id)
        if model is None:
            self.add(eisenpakket)
            return
        _update_eisenpakket_model(model, eisenpakket)

    def get(self, eisenpakket_id: str) -> Eisenpakket | None:
        model = self.session.get(EisenpakketModel, eisenpakket_id)
        return _model_to_eisenpakket(model) if model else None

    def get_current(self, kunstwerk_id: KunstwerkId, soort: EisenSoort) -> Eisenpakket | None:
        model = self.session.scalars(
            select(EisenpakketModel)
            .where(
                EisenpakketModel.kunstwerk_id == str(kunstwerk_id),
                EisenpakketModel.soort == soort.value,
                EisenpakketModel.status == EisenpakketStatus.VASTGESTELD.value,
            )
            .order_by(EisenpakketModel.versie.desc())
        ).first()
        return _model_to_eisenpakket(model) if model else None

    def list_for_kunstwerk(
        self,
        kunstwerk_id: KunstwerkId,
        soort: EisenSoort | None = None,
    ) -> list[Eisenpakket]:
        statement = select(EisenpakketModel).where(
            EisenpakketModel.kunstwerk_id == str(kunstwerk_id)
        )
        if soort is not None:
            statement = statement.where(EisenpakketModel.soort == soort.value)
        models = self.session.scalars(
            statement.order_by(EisenpakketModel.soort, EisenpakketModel.versie.desc())
        ).all()
        return [_model_to_eisenpakket(model) for model in models]

    def next_version(self, kunstwerk_id: KunstwerkId, soort: EisenSoort) -> int:
        current = self.session.scalar(
            select(func.max(EisenpakketModel.versie)).where(
                EisenpakketModel.kunstwerk_id == str(kunstwerk_id),
                EisenpakketModel.soort == soort.value,
            )
        )
        return int(current or 0) + 1


class SqlAlchemyRapportageBeoordelingRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, beoordeling: RapportageBeoordeling) -> None:
        self.session.add(_beoordeling_to_model(beoordeling))

    def get(self, beoordeling_id: str) -> RapportageBeoordeling | None:
        model = self.session.get(RapportageBeoordelingModel, beoordeling_id)
        return _model_to_beoordeling(model) if model else None

    def get_by_bron_event_id(self, bron_event_id: str) -> RapportageBeoordeling | None:
        model = self.session.scalars(
            select(RapportageBeoordelingModel).where(
                RapportageBeoordelingModel.bron_event_id == bron_event_id
            )
        ).first()
        return _model_to_beoordeling(model) if model else None

    def list(
        self,
        kunstwerk_id: KunstwerkId | None = None,
        rapportage_type: RapportageType | None = None,
    ) -> list[RapportageBeoordeling]:
        statement = select(RapportageBeoordelingModel)
        if kunstwerk_id is not None:
            statement = statement.where(RapportageBeoordelingModel.kunstwerk_id == str(kunstwerk_id))
        if rapportage_type is not None:
            statement = statement.where(
                RapportageBeoordelingModel.rapportage_type == rapportage_type.value
            )
        models = self.session.scalars(
            statement.order_by(RapportageBeoordelingModel.created_at.desc())
        ).all()
        return [_model_to_beoordeling(model) for model in models]


class SqlAlchemyVerwerktEventRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def has(self, event_id: str) -> bool:
        return self.session.get(VerwerktEventModel, event_id) is not None

    def add(
        self,
        event_id: str,
        event_type: str,
        occurred_at: datetime,
        processed_at: datetime,
    ) -> None:
        self.session.add(
            VerwerktEventModel(
                event_id=event_id,
                event_type=event_type,
                occurred_at=occurred_at,
                processed_at=processed_at,
            )
        )


def _kunstwerk_to_model(kunstwerk: Kunstwerk) -> KunstwerkModel:
    model = KunstwerkModel(id=str(kunstwerk.kunstwerk_id))
    _update_kunstwerk_model(model, kunstwerk)
    return model


def _update_kunstwerk_model(model: KunstwerkModel, kunstwerk: Kunstwerk) -> None:
    model.naam = kunstwerk.naam
    model.type = kunstwerk.type.value
    model.locatie = str(kunstwerk.locatie)
    model.status = kunstwerk.status.value
    model.beheerder = kunstwerk.beheerder
    model.jaar_renovatie = kunstwerk.jaar_renovatie
    model.laatste_inspectiedatum = kunstwerk.laatste_inspectiedatum
    model.buitengebruik_reden = kunstwerk.buitengebruik_reden
    model.buitengebruik_datum = kunstwerk.buitengebruik_datum
    model.created_at = kunstwerk.aangemaakt_op
    model.updated_at = kunstwerk.gewijzigd_op


def _model_to_kunstwerk(model: KunstwerkModel) -> Kunstwerk:
    return Kunstwerk(
        kunstwerk_id=KunstwerkId(model.id),
        naam=model.naam,
        type=KunstwerkType(model.type),
        locatie=Locatie(model.locatie),
        status=KunstwerkStatus(model.status),
        beheerder=model.beheerder,
        jaar_renovatie=model.jaar_renovatie,
        laatste_inspectiedatum=model.laatste_inspectiedatum,
        buitengebruik_reden=model.buitengebruik_reden,
        buitengebruik_datum=model.buitengebruik_datum,
        aangemaakt_op=model.created_at,
        gewijzigd_op=model.updated_at,
    )


def _eisenpakket_to_model(eisenpakket: Eisenpakket) -> EisenpakketModel:
    model = EisenpakketModel(id=eisenpakket.eisenpakket_id)
    _update_eisenpakket_model(model, eisenpakket)
    return model


def _update_eisenpakket_model(model: EisenpakketModel, eisenpakket: Eisenpakket) -> None:
    model.kunstwerk_id = str(eisenpakket.kunstwerk_id)
    model.soort = eisenpakket.soort.value
    model.versie = eisenpakket.versie
    model.status = eisenpakket.status.value
    model.onderhoudsstrategie = eisenpakket.onderhoudsstrategie
    model.vastgesteld_op = eisenpakket.vastgesteld_op
    model.created_at = eisenpakket.aangemaakt_op
    model.updated_at = eisenpakket.gewijzigd_op
    model.eisen = [
        EisModel(
            code=eis.code,
            omschrijving=eis.omschrijving,
            meetwaarde=eis.meetwaarde,
            operator=eis.operator.value,
            grenswaarde=eis.grenswaarde,
            eenheid=eis.eenheid,
        )
        for eis in eisenpakket.eisen
    ]


def _model_to_eisenpakket(model: EisenpakketModel) -> Eisenpakket:
    return Eisenpakket(
        eisenpakket_id=model.id,
        kunstwerk_id=KunstwerkId(model.kunstwerk_id),
        soort=EisenSoort(model.soort),
        versie=model.versie,
        status=EisenpakketStatus(model.status),
        eisen=[
            Eis(
                code=eis.code,
                omschrijving=eis.omschrijving,
                meetwaarde=eis.meetwaarde,
                operator=EisOperator(eis.operator),
                grenswaarde=eis.grenswaarde,
                eenheid=eis.eenheid,
            )
            for eis in model.eisen
        ],
        vastgesteld_op=model.vastgesteld_op,
        aangemaakt_op=model.created_at,
        gewijzigd_op=model.updated_at,
        onderhoudsstrategie=model.onderhoudsstrategie,
    )


def _beoordeling_to_model(beoordeling: RapportageBeoordeling) -> RapportageBeoordelingModel:
    return RapportageBeoordelingModel(
        id=beoordeling.beoordeling_id,
        extern_rapport_id=beoordeling.extern_rapport_id,
        bron_event_id=beoordeling.bron_event_id,
        kunstwerk_id=str(beoordeling.kunstwerk_id),
        rapportage_type=beoordeling.rapportage_type.value,
        eisenpakket_id=beoordeling.eisenpakket_id,
        resultaat=beoordeling.resultaat.value,
        ontvangen_op=beoordeling.ontvangen_op,
        created_at=beoordeling.aangemaakt_op,
        bevindingen=[
            RapportageBevindingModel(
                eis_code=bevinding.eis_code,
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


def _model_to_beoordeling(model: RapportageBeoordelingModel) -> RapportageBeoordeling:
    return RapportageBeoordeling(
        beoordeling_id=model.id,
        extern_rapport_id=model.extern_rapport_id,
        bron_event_id=model.bron_event_id,
        kunstwerk_id=KunstwerkId(model.kunstwerk_id),
        rapportage_type=RapportageType(model.rapportage_type),
        ontvangen_op=model.ontvangen_op,
        eisenpakket_id=model.eisenpakket_id,
        resultaat=RapportageResultaat(model.resultaat),
        bevindingen=[
            RapportageBevinding(
                eis_code=bevinding.eis_code,
                meetwaarde=bevinding.meetwaarde,
                operator=bevinding.operator,
                grenswaarde=bevinding.grenswaarde,
                eenheid=bevinding.eenheid,
                resultaat=BevindingResultaat(bevinding.resultaat),
                toelichting=bevinding.toelichting,
            )
            for bevinding in model.bevindingen
        ],
        aangemaakt_op=model.created_at,
    )
