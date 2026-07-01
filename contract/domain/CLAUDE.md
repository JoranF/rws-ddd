<!-- Bounded context: Contract (contract) -->

# Laag: Domain

De kern. Bevat de bedrijfslogica en de taal van het domein (ubiquitous language).

## Wat hoort hier
- Entities & Aggregates met hun invarianten (de regels die altijd waar moeten zijn)
- Value Objects (bv. Locatie, KunstwerkId, Periode, Bedrag)
- Domain Events (puur, zonder transport-/serialisatiedetails)
- Repository-*interfaces* (contracten, geen implementatie)
- Domain Services voor logica die niet bij één entity hoort

## Afhankelijkheidsregel
Domain hangt van NIETS af. Geen framework, geen database, geen HTTP, geen RabbitMQ.
Heb je hier een import naar infrastructuur/framework nodig? Dan hoort de code niet in deze laag.

## Voor de AI die hier bouwt
- Gebruik exact de termen uit de service-README (ubiquitous language). Verzin geen synoniemen.
- Bewaak invarianten in de aggregate, niet in de controller of de database.
- Verwijs naar andere bounded contexts alleen via ID's, nooit via directe import.
