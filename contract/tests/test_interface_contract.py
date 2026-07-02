from __future__ import annotations

from pathlib import Path

import pytest


pytestmark = pytest.mark.interface

ROOT = Path(__file__).resolve().parents[2]
CONTEXT = ROOT / "contract"
README = (CONTEXT / "README.md").read_text(encoding="utf-8")
GUIDANCE = (CONTEXT / "CLAUDE.md").read_text(encoding="utf-8")
ENV = (CONTEXT / ".env.example").read_text(encoding="utf-8")


def test_contract_http_interface_contract_is_documented() -> None:
    assert "Poort **8001" in GUIDANCE
    assert "GET /health" in GUIDANCE
    assert "`GET /api/contracten`" in README
    assert "`GET /api/contracten?kunstwerkId=...`" in README


def test_contract_environment_contract_is_documented() -> None:
    assert "SERVICE_PORT=8001" in ENV
    assert "DATABASE_URL=postgres://rws:rws@postgres:5432/contract_db" in ENV
    assert "RABBITMQ_URL=amqp://rws:rws@rabbitmq:5672" in ENV
