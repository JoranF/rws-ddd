from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from infrastructure.db import Base


class KunstwerkModel(Base):
    __tablename__ = "kunstwerk"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    naam: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(80), nullable=False)
    locatie: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(80), nullable=False)
    beheerder: Mapped[str | None] = mapped_column(String(255))
    jaar_renovatie: Mapped[int | None] = mapped_column(Integer)
    laatste_inspectiedatum: Mapped[date | None] = mapped_column(Date)
    buitengebruik_reden: Mapped[str | None] = mapped_column(Text)
    buitengebruik_datum: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class EisenpakketModel(Base):
    __tablename__ = "eisenpakket"
    __table_args__ = (
        UniqueConstraint("kunstwerk_id", "soort", "versie", name="uq_eisenpakket_versie"),
    )

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    kunstwerk_id: Mapped[str] = mapped_column(
        String(80),
        ForeignKey("kunstwerk.id"),
        nullable=False,
        index=True,
    )
    soort: Mapped[str] = mapped_column(String(80), nullable=False)
    versie: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(80), nullable=False)
    onderhoudsstrategie: Mapped[str | None] = mapped_column(Text)
    vastgesteld_op: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    eisen: Mapped[list[EisModel]] = relationship(
        back_populates="eisenpakket",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class EisModel(Base):
    __tablename__ = "eis"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    eisenpakket_id: Mapped[str] = mapped_column(
        String(80),
        ForeignKey("eisenpakket.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(80), nullable=False)
    omschrijving: Mapped[str] = mapped_column(Text, nullable=False)
    meetwaarde: Mapped[str] = mapped_column(String(120), nullable=False)
    operator: Mapped[str] = mapped_column(String(8), nullable=False)
    grenswaarde: Mapped[float] = mapped_column(Float, nullable=False)
    eenheid: Mapped[str] = mapped_column(String(40), nullable=False)

    eisenpakket: Mapped[EisenpakketModel] = relationship(back_populates="eisen")


class RapportageBeoordelingModel(Base):
    __tablename__ = "rapportage_beoordeling"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    extern_rapport_id: Mapped[str] = mapped_column(String(120), nullable=False)
    bron_event_id: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    kunstwerk_id: Mapped[str] = mapped_column(
        String(80),
        ForeignKey("kunstwerk.id"),
        nullable=False,
        index=True,
    )
    rapportage_type: Mapped[str] = mapped_column(String(80), nullable=False)
    eisenpakket_id: Mapped[str | None] = mapped_column(String(80), ForeignKey("eisenpakket.id"))
    resultaat: Mapped[str] = mapped_column(String(80), nullable=False)
    ontvangen_op: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    bevindingen: Mapped[list[RapportageBevindingModel]] = relationship(
        back_populates="beoordeling",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class RapportageBevindingModel(Base):
    __tablename__ = "rapportage_bevinding"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    beoordeling_id: Mapped[str] = mapped_column(
        String(80),
        ForeignKey("rapportage_beoordeling.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    eis_code: Mapped[str | None] = mapped_column(String(80))
    meetwaarde: Mapped[float | None] = mapped_column(Float)
    operator: Mapped[str | None] = mapped_column(String(8))
    grenswaarde: Mapped[float | None] = mapped_column(Float)
    eenheid: Mapped[str | None] = mapped_column(String(40))
    resultaat: Mapped[str] = mapped_column(String(80), nullable=False)
    toelichting: Mapped[str] = mapped_column(Text, nullable=False)

    beoordeling: Mapped[RapportageBeoordelingModel] = relationship(back_populates="bevindingen")


class VerwerktEventModel(Base):
    __tablename__ = "verwerkt_event"

    event_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    event_type: Mapped[str] = mapped_column(String(160), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    processed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
