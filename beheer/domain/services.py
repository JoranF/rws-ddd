from __future__ import annotations

from domain.model import (
    BevindingResultaat,
    Eis,
    Eisenpakket,
    RapportageBevinding,
    RapportageResultaat,
)


class EisenValidator:
    def beoordeel(
        self,
        eisenpakket: Eisenpakket | None,
        rapportwaarden: dict[str, float],
    ) -> tuple[RapportageResultaat, list[RapportageBevinding]]:
        if eisenpakket is None:
            return RapportageResultaat.NIET_TE_BEOORDELEN, [
                RapportageBevinding(
                    eis_code=None,
                    meetwaarde=None,
                    operator=None,
                    grenswaarde=None,
                    eenheid=None,
                    resultaat=BevindingResultaat.NIET_TE_BEOORDELEN,
                    toelichting="Geen huidig vastgesteld eisenpakket gevonden",
                )
            ]

        bevindingen: list[RapportageBevinding] = []
        heeft_bruikbare_waarde = False
        heeft_fout = False
        heeft_onbeoordeelbaar = False

        for eis in eisenpakket.eisen:
            waarde = self._waarde_voor_eis(eis, rapportwaarden)
            if waarde is None:
                heeft_onbeoordeelbaar = True
                bevindingen.append(
                    RapportageBevinding(
                        eis_code=eis.code,
                        meetwaarde=None,
                        operator=eis.operator.value,
                        grenswaarde=eis.grenswaarde,
                        eenheid=eis.eenheid,
                        resultaat=BevindingResultaat.NIET_TE_BEOORDELEN,
                        toelichting=f"Meetwaarde '{eis.meetwaarde}' ontbreekt",
                    )
                )
                continue

            heeft_bruikbare_waarde = True
            voldoet = self._vergelijk(waarde, eis)
            if not voldoet:
                heeft_fout = True
            bevindingen.append(
                RapportageBevinding(
                    eis_code=eis.code,
                    meetwaarde=waarde,
                    operator=eis.operator.value,
                    grenswaarde=eis.grenswaarde,
                    eenheid=eis.eenheid,
                    resultaat=(
                        BevindingResultaat.VOLDOET
                        if voldoet
                        else BevindingResultaat.VOLDOET_NIET
                    ),
                    toelichting="Voldoet aan eis" if voldoet else "Voldoet niet aan eis",
                )
            )

        if not heeft_bruikbare_waarde:
            return RapportageResultaat.NIET_TE_BEOORDELEN, bevindingen
        if heeft_fout:
            return RapportageResultaat.VOLDOET_NIET, bevindingen
        if heeft_onbeoordeelbaar:
            return RapportageResultaat.NIET_TE_BEOORDELEN, bevindingen
        return RapportageResultaat.VOLDOET, bevindingen

    @staticmethod
    def _waarde_voor_eis(eis: Eis, rapportwaarden: dict[str, float]) -> float | None:
        waarde = rapportwaarden.get(eis.meetwaarde)
        if waarde is None:
            waarde = rapportwaarden.get(eis.code)
        if waarde is None:
            return None
        return float(waarde)

    @staticmethod
    def _vergelijk(waarde: float, eis: Eis) -> bool:
        operator = eis.operator.value
        if operator == "<":
            return waarde < eis.grenswaarde
        if operator == "<=":
            return waarde <= eis.grenswaarde
        if operator == ">":
            return waarde > eis.grenswaarde
        if operator == ">=":
            return waarde >= eis.grenswaarde
        if operator == "=":
            return waarde == eis.grenswaarde
        return False
