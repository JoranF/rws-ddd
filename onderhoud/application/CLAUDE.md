<!-- Bounded context: Onderhoud (onderhoud) -->

# Laag: Application

Orkestreert use cases. Een dun laagje dat het domein aanstuurt.

## Wat hoort hier
- Use cases / application services (commands & queries), bv. RegistreerObject, PlanWerkorder
- Transactiegrenzen: één use case = één transactie
- Aanroepen van repository-interfaces uit domain
- Publiceren van domain events via een interface (niet direct RabbitMQ)
- Mapping van/naar DTO's

## Afhankelijkheidsregel
Mag alleen domain gebruiken. NIET infrastructure of interface.
Geen SQL, geen HTTP, geen broker-code hier — alleen interfaces.

## Voor de AI die hier bouwt
- Houd use cases klein en met één verantwoordelijkheid.
- Geen bedrijfsregels hier; die horen in domain. Hier alleen orkestratie.
