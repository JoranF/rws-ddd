# Onderhoud

Bounded context: **inspecties, werkorders en onderhoudsplanning**. Zet meldingen en
geplande activiteiten om in werkorders, wijst ze toe aan een uitvoerder en volgt ze tot
afronding. Dit is de meest downstream context.

- **Poort:** 8003
- **Database:** `onderhoud_db`
- **Eigenaar:** _TBD_

## Verantwoordelijkheden
- Werkorders aanmaken n.a.v. een melding (Monitoring) of geplande inspectie.
- Werk toewijzen binnen het geldende contract (Contract) en plannen.
- Werkorders volgen van gepland → in uitvoering → afgerond.

## Ubiquitous language (startpunt)
Werkorder · Inspectie · Onderhoudsplan · Planning · Uitvoerder ·
Status (Gepland/InUitvoering/Afgerond) · ObjectId/ContractId/MeldingId (referenties).

## Integratie
- **Publiceert:** `onderhoud.werkorder.aangemaakt`, `onderhoud.werkorder.afgerond`.
- **Consumeert:** `monitoring.melding.aangemaakt`, `contract.contract.afgesloten`,
  `beheer.object.*`.
- **REST:** `GET /api/werkorders`, `POST /api/werkorders`.

## Draaien
Zie de [checklist in conventions.md](../docs/conventions.md#8-checklist--je-service-toevoegen).
