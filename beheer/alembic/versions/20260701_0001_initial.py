"""initial beheer schema

Revision ID: 20260701_0001
Revises:
Create Date: 2026-07-01
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260701_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "kunstwerk",
        sa.Column("id", sa.String(length=80), nullable=False),
        sa.Column("naam", sa.String(length=255), nullable=False),
        sa.Column("type", sa.String(length=80), nullable=False),
        sa.Column("locatie", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=80), nullable=False),
        sa.Column("beheerder", sa.String(length=255), nullable=True),
        sa.Column("jaar_renovatie", sa.Integer(), nullable=True),
        sa.Column("laatste_inspectiedatum", sa.Date(), nullable=True),
        sa.Column("buitengebruik_reden", sa.Text(), nullable=True),
        sa.Column("buitengebruik_datum", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "eisenpakket",
        sa.Column("id", sa.String(length=80), nullable=False),
        sa.Column("kunstwerk_id", sa.String(length=80), nullable=False),
        sa.Column("soort", sa.String(length=80), nullable=False),
        sa.Column("versie", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=80), nullable=False),
        sa.Column("onderhoudsstrategie", sa.Text(), nullable=True),
        sa.Column("vastgesteld_op", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["kunstwerk_id"], ["kunstwerk.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("kunstwerk_id", "soort", "versie", name="uq_eisenpakket_versie"),
    )
    op.create_index("ix_eisenpakket_kunstwerk_id", "eisenpakket", ["kunstwerk_id"])
    op.create_table(
        "eis",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("eisenpakket_id", sa.String(length=80), nullable=False),
        sa.Column("code", sa.String(length=80), nullable=False),
        sa.Column("omschrijving", sa.Text(), nullable=False),
        sa.Column("meetwaarde", sa.String(length=120), nullable=False),
        sa.Column("operator", sa.String(length=8), nullable=False),
        sa.Column("grenswaarde", sa.Float(), nullable=False),
        sa.Column("eenheid", sa.String(length=40), nullable=False),
        sa.ForeignKeyConstraint(["eisenpakket_id"], ["eisenpakket.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_eis_eisenpakket_id", "eis", ["eisenpakket_id"])
    op.create_table(
        "rapportage_beoordeling",
        sa.Column("id", sa.String(length=80), nullable=False),
        sa.Column("extern_rapport_id", sa.String(length=120), nullable=False),
        sa.Column("bron_event_id", sa.String(length=120), nullable=False),
        sa.Column("kunstwerk_id", sa.String(length=80), nullable=False),
        sa.Column("rapportage_type", sa.String(length=80), nullable=False),
        sa.Column("eisenpakket_id", sa.String(length=80), nullable=True),
        sa.Column("resultaat", sa.String(length=80), nullable=False),
        sa.Column("ontvangen_op", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["eisenpakket_id"], ["eisenpakket.id"]),
        sa.ForeignKeyConstraint(["kunstwerk_id"], ["kunstwerk.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("bron_event_id"),
    )
    op.create_index(
        "ix_rapportage_beoordeling_bron_event_id",
        "rapportage_beoordeling",
        ["bron_event_id"],
    )
    op.create_index(
        "ix_rapportage_beoordeling_kunstwerk_id",
        "rapportage_beoordeling",
        ["kunstwerk_id"],
    )
    op.create_table(
        "rapportage_bevinding",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("beoordeling_id", sa.String(length=80), nullable=False),
        sa.Column("eis_code", sa.String(length=80), nullable=True),
        sa.Column("meetwaarde", sa.Float(), nullable=True),
        sa.Column("operator", sa.String(length=8), nullable=True),
        sa.Column("grenswaarde", sa.Float(), nullable=True),
        sa.Column("eenheid", sa.String(length=40), nullable=True),
        sa.Column("resultaat", sa.String(length=80), nullable=False),
        sa.Column("toelichting", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["beoordeling_id"],
            ["rapportage_beoordeling.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_rapportage_bevinding_beoordeling_id",
        "rapportage_bevinding",
        ["beoordeling_id"],
    )
    op.create_table(
        "verwerkt_event",
        sa.Column("event_id", sa.String(length=120), nullable=False),
        sa.Column("event_type", sa.String(length=160), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("event_id"),
    )


def downgrade() -> None:
    op.drop_table("verwerkt_event")
    op.drop_index("ix_rapportage_bevinding_beoordeling_id", table_name="rapportage_bevinding")
    op.drop_table("rapportage_bevinding")
    op.drop_index("ix_rapportage_beoordeling_kunstwerk_id", table_name="rapportage_beoordeling")
    op.drop_index("ix_rapportage_beoordeling_bron_event_id", table_name="rapportage_beoordeling")
    op.drop_table("rapportage_beoordeling")
    op.drop_index("ix_eis_eisenpakket_id", table_name="eis")
    op.drop_table("eis")
    op.drop_index("ix_eisenpakket_kunstwerk_id", table_name="eisenpakket")
    op.drop_table("eisenpakket")
    op.drop_table("kunstwerk")
