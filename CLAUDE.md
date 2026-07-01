# CLAUDE.md — RWS-DDD monorepo

Leidraad voor elke AI-assistent (en mens) die in deze repo werkt. Lees dit eerst,
daarna `docs/conventions.md` en de `CLAUDE.md` van de service + laag waar je in werkt.

## Wat dit is
Een DDD-schoolproject: vier onafhankelijke bounded contexts voor Rijkswaterstaat-
infrastructuurbeheer, elk een eigen service in een eigen map (`contract/`,
`monitoring/`, `onderhoud/`, `beheer/`). Services zijn stack-agnostisch: elke
teamgenoot kiest zijn eigen taal/framework.

## Gouden regels (niet onderhandelbaar)
1. **Respecteer de contextgrens.** Werk alleen in de service waar je aan bent
   toegewezen. Wijzig niet de code of database van een andere context.
2. **Integreer alleen via REST of events**, nooit via een gedeelde database of een
   directe import over servicegrenzen heen. Verwijs naar andere contexts via ID's.
3. **Respecteer de laagindeling** binnen een service: `domain` → `application` →
   `interface`, met `infrastructure` die naar binnen wijst. De afhankelijkheid wijst
   altijd naar het domein toe, nooit eruit. Elke laag heeft een eigen `CLAUDE.md` —
   lees die voordat je in die map schrijft.
4. **Gebruik de ubiquitous language** uit de service-README. Verzin geen synoniemen.
5. **Poort + `/health` zijn verplicht** (zie `docs/conventions.md`).
6. **Events volgen de envelope** uit `docs/events.md`. Consumers zijn idempotent.

## Waar vind je wat
- Afspraken (poorten, REST, env, lagen, checklist): `docs/conventions.md`
- Hoe contexts zich verhouden: `docs/context-map.md`
- Event-contract: `docs/events.md`
- Deployen: `docs/dokploy.md`
- Vervolgstappen, stack-per-service & Fase 2-integratie: `docs/vervolgstappen.md`

## Wat NIET te doen
- Geen refactor over servicegrenzen heen.
- Geen bedrijfsregels in `interface` of `infrastructure` — die horen in `domain`.
- Geen directe DB-koppeling tussen contexts "omdat het sneller is".
