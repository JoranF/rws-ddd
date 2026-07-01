<!-- Bounded context: Onderhoud (onderhoud) -->

# Laag: Interface (Presentation / API)

De ingang van buitenaf. Vertaalt verzoeken naar use cases.

## Wat hoort hier
- REST-controllers/routes onder `/api` (zie ../../docs/conventions.md)
- Event-subscribers/handlers die inkomende events omzetten naar use-case-aanroepen
- Request/response-DTO's + validatie
- Het `GET /health`-endpoint

## Afhankelijkheidsregel
Mag application (use cases) aanroepen. Bevat GEEN bedrijfslogica.
Dun: ontvang -> valideer -> roep use case -> geef antwoord.

## Voor de AI die hier bouwt
- Geen domeinregels in controllers.
- Documenteer elke endpoint (OpenAPI) zodat teamgenoten je context kunnen aanroepen.
