from __future__ import annotations

from pathlib import Path

import pytest


pytestmark = pytest.mark.interface

ROOT = Path(__file__).resolve().parents[2]
CONTEXT = ROOT / "onderhoud"
README = (CONTEXT / "README.md").read_text(encoding="utf-8")
GUIDANCE = (CONTEXT / "CLAUDE.md").read_text(encoding="utf-8")
ENV = (CONTEXT / ".env.example").read_text(encoding="utf-8")


def test_onderhoud_http_interface_contract_is_documented() -> None:
    assert "Poort **8003" in GUIDANCE
    assert "GET /health" in GUIDANCE
    assert "`GET /api/onderhoud`" in README
    assert "`POST /api/storingen`" in README


def test_onderhoud_environment_contract_is_documented() -> None:
    assert "SERVICE_PORT=8003" in ENV
    assert "DATABASE_URL=postgres://rws:rws@postgres:5432/onderhoud_db" in ENV
    assert "RABBITMQ_URL=amqp://rws:rws@rabbitmq:5672" in ENV
