# Contract

Bounded context: **onderhoudscontracten met aannemers**. Beheert welke aannemer welk
object (of areaal) onderhoudt, onder welke voorwaarden en voor welke periode.

- **Poort:** 8001
- **Database:** `contract_db`
- **Eigenaar:** _TBD_

## Verantwoordelijkheden
- Contracten afsluiten, wijzigen en beëindigen, gekoppeld aan een `ObjectId` uit Beheer.
- Looptijd, scope, kosten en SLA/prestatieafspraken vastleggen.
- Vragen kunnen beantwoorden als "welk contract dekt object X?".

## Ubiquitous language (startpunt)
Contract · Aannemer · Contractperiode · SLA · Prestatieafspraak · ContractRegel ·
Kosten · ObjectId (referentie naar Beheer).

## Integratie
- **Publiceert:** `contract.contract.afgesloten`, `contract.contract.beeindigd`.
- **Consumeert:** `beheer.object.geregistreerd`, `beheer.object.buitengebruikgesteld`
  (weten voor welke objecten een contract kan/mag bestaan).
- **REST:** `GET /api/contracten`, `GET /api/contracten?objectId=...`.

## Draaien
Zie de [checklist in conventions.md](../docs/conventions.md#8-checklist--je-service-toevoegen).
