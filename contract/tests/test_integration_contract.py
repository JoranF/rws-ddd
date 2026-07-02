from __future__ import annotations

from pathlib import Path

import pytest


pytestmark = pytest.mark.integration

ROOT = Path(__file__).resolve().parents[2]
EVENTS = (ROOT / "docs" / "events.md").read_text(encoding="utf-8")
POSTGRES_INIT = (
    ROOT / "infra" / "postgres" / "init" / "01-create-databases.sql"
).read_text(encoding="utf-8")


def test_contract_database_is_created_by_local_infra() -> None:
    assert "CREATE DATABASE contract_db;" in POSTGRES_INIT


def test_contract_published_events_are_in_shared_event_catalog() -> None:
    for event_type in (
        "contract.aanbesteding.gepubliceerd",
        "contract.inschrijving.ontvangen",
        "contract.aanbesteding.gegund",
        "contract.onderhoudscontract.gegund",
        "contract.wijziging.goedgekeurd",
        "contract.prestatieverklaring.opgesteld",
        "contract.onderhoudscontract.afgerond",
    ):
        assert event_type in EVENTS


def test_contract_consumed_events_are_in_shared_event_catalog() -> None:
    for event_type in (
        "beheer.kunstwerk.geregistreerd",
        "beheer.kunstwerk.buitengebruikgesteld",
        "beheer.ontwerpeisen.vastgesteld",
        "monitoring.rapport.opgesteld",
    ):
        assert event_type in EVENTS
