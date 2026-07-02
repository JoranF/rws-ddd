from __future__ import annotations

from pathlib import Path

import pytest


pytestmark = pytest.mark.unit

ROOT = Path(__file__).resolve().parents[2]
CONTEXT = ROOT / "contract"
README = (CONTEXT / "README.md").read_text(encoding="utf-8")
GUIDANCE = (CONTEXT / "CLAUDE.md").read_text(encoding="utf-8")


def test_contract_context_has_required_layer_scaffold() -> None:
    for layer in ("domain", "application", "interface", "infrastructure"):
        layer_path = CONTEXT / layer
        assert layer_path.is_dir()
        assert (layer_path / "CLAUDE.md").is_file()


def test_contract_context_documents_core_domain_language() -> None:
    for term in (
        "Onderhoudscontract",
        "Aanbesteding",
        "Inschrijving",
        "EMVI",
        "kunstwerkId",
    ):
        assert term in README


def test_contract_context_boundary_is_explicit() -> None:
    assert "Bezit:" in GUIDANCE
    assert "Bezit NIET:" in GUIDANCE
    assert "kopieer\n  geen beheer-model" in GUIDANCE
