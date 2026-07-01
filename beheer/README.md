# Beheer

Bounded context: **kunstwerk-register + eisen (onderhoudsbeheer & administratie)**. Dit is
de *bron van waarheid* voor welke kunstwerken er bestaan en wat de basisgegevens zijn.
Beheer stelt de eisen op waaraan een kunstwerk moet voldoen en bewaakt de levenscyclus.
Andere contexts verwijzen naar een kunstwerk via de hier uitgegeven `KunstwerkId`.

- **Poort:** 8004
- **Database:** `beheer_db` (verslag: MySQL relationeel, op Python)
- **Eigenaar:** _TBD_

## Verantwoordelijkheden
- Kunstwerken registreren, wijzigen en buiten gebruik stellen / afkeuren (brug, sluis, tunnel, gemaal, dijk, …).
- Basisgegevens beheren: type, locatie, status.
- **Eisen** opstellen en valideren: onderhoudseisen en ontwerpeisen.
- Onderhoud initiëren en het onderhoudsrapport terugkoppelen; netwerkrapportages valideren.
- `KunstwerkId` uitgeven als stabiele referentie voor de rest van het systeem.

## Ubiquitous language (uit het verslag)
Kunstwerk · Eisen (Onderhoudseisen / Ontwerpeisen) · Onderhoudsstrategieën ·
Onderhoudsrapport · Netwerkrapportage · Asset manager · Maintenance engineer ·
Status · KunstwerkId (referentie voor andere contexts).

## Integratie
- **Publiceert:** `beheer.kunstwerk.geregistreerd`, `beheer.kunstwerk.buitengebruikgesteld`,
  `beheer.onderhoudseisen.vastgesteld`, `beheer.ontwerpeisen.vastgesteld`.
- **Consumeert:** `monitoring.rapport.opgesteld` (netwerkrapportage om eisen te valideren),
  `onderhoud.onderhoud.afgerond` (onderhoudsrapport — partnership met Onderhoud).
- **Relaties:** partner van **Onderhoud**, customer van **Monitoring**, supplier van
  **Contract**. Zie [context-map.md](../docs/context-map.md).
- **REST:** `GET /api/kunstwerken`, `GET /api/kunstwerken/{id}` zodat andere contexts
  kunstwerkdata kunnen opvragen.

## Draaien
Zie de [checklist in conventions.md](../docs/conventions.md#8-checklist--je-service-toevoegen).
