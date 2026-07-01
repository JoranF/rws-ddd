<!-- Bounded context: Beheer (beheer) -->

# Laag: Infrastructure

De techniek. Implementeert de interfaces die domain/application definiëren.

## Wat hoort hier
- Repository-implementaties (DB-queries, ORM, migraties) — gebruikt DATABASE_URL
- RabbitMQ publisher & consumers — RABBITMQ_URL, exchange `rws.events` (zie ../../docs/events.md)
- HTTP-clients naar andere services (REST)
- Config, logging, en de concrete /health-implementatie

## Afhankelijkheidsregel
Mag domain en application-interfaces gebruiken. Domain mag NOOIT infrastructure importeren.
De afhankelijkheid wijst naar binnen (Dependency Inversion).

## Voor de AI die hier bouwt
- Vertaal externe data naar domain-objecten aan de rand; houd het domein 'schoon'.
- Publiceer events volgens de envelope in ../../docs/events.md. Maak consumers idempotent.
- Praat NOOIT met de database van een andere bounded context. Alleen via REST/events.
