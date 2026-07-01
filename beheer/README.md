# Beheer

Bounded context: **register van kunstwerken/objecten**. Dit is de *bron van waarheid*
voor welke infrastructuur er bestaat en wat de basisgegevens zijn. Andere contexts
verwijzen naar objecten via de hier uitgegeven `ObjectId`.

- **Poort:** 8004
- **Database:** `beheer_db`
- **Eigenaar:** _TBD_

## Verantwoordelijkheden
- Objecten registreren, wijzigen en buiten gebruik stellen (brug, sluis, tunnel, gemaal, dijk, …).
- Basisgegevens beheren: type, locatie, status, levensduur/areaal.
- `ObjectId` uitgeven als stabiele referentie voor de rest van het systeem.

## Ubiquitous language (startpunt)
Object (Kunstwerk) · ObjectType (Brug/Sluis/Tunnel/Gemaal/Dijk/Stormvloedkering) ·
Locatie · Status (InGebruik/BuitenGebruik) · Areaal · Levensduur.

## Integratie
- **Publiceert:** `beheer.object.geregistreerd`, `beheer.object.gewijzigd`,
  `beheer.object.buitengebruikgesteld`.
- **Consumeert:** in principe niets — Beheer is upstream.
- **REST:** `GET /api/objecten`, `GET /api/objecten/{id}` zodat andere contexts objectdata
  kunnen opvragen.

## Draaien
Zie de [checklist in conventions.md](../docs/conventions.md#8-checklist--je-service-toevoegen).
