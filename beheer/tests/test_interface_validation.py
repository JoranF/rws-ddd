from __future__ import annotations

import pytest
from pydantic import ValidationError

from interface.schemas import RegistreerKunstwerkRequest, StelEisenVastRequest


def test_request_modellen_weigeren_extra_velden() -> None:
    with pytest.raises(ValidationError):
        RegistreerKunstwerkRequest.model_validate(
            {
                "naam": "Brug A",
                "type": "Brug",
                "locatie": "A12 km 4",
                "status": "Geregistreerd",
                "onbekendVeld": "wordt niet genegeerd",
            }
        )


def test_geneste_request_modellen_weigeren_extra_velden() -> None:
    with pytest.raises(ValidationError):
        StelEisenVastRequest.model_validate(
            {
                "eisen": [
                    {
                        "code": "SPOOR",
                        "omschrijving": "Spoorvorming maximaal",
                        "meetwaarde": "spoorvorming",
                        "operator": "<=",
                        "grenswaarde": 8.0,
                        "eenheid": "mm",
                        "weging": "niet toegestaan",
                    }
                ]
            }
        )
