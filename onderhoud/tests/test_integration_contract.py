from __future__ import annotations

from pathlib import Path

import pytest


pytestmark = pytest.mark.integration

ROOT = Path(__file__).resolve().parents[2]
EVENTS = (ROOT / "docs" / "events.md").read_text(encoding="utf-8")
POSTGRES_INIT = (
    ROOT / "infra" / "postgres" / "init" / "01-create-databases.sql"
).read_text(encoding="utf-8")


def test_onderhoud_database_is_created_by_local_infra() -> None:
    assert "CREATE DATABASE onderhoud_db;" in POSTGRES_INIT


def test_onderhoud_published_events_are_in_shared_event_catalog() -> None:
    for event_type in (
        "onderhoud.storing.gemeld",
        "onderhoud.onderhoud.gestart",
        "onderhoud.onderhoud.afgerond",
        "onderhoud.contractaanvraag.ingediend",
    ):
        assert event_type in EVENTS


def test_onderhoud_consumed_events_are_in_shared_event_catalog() -> None:
    for event_type in (
        "monitoring.incident.aangemaakt",
        "contract.onderhoudscontract.gegund",
        "beheer.onderhoudseisen.vastgesteld",
        "beheer.kunstwerk.geregistreerd",
        "beheer.kunstwerk.buitengebruikgesteld",
    ):
        assert event_type in EVENTS
