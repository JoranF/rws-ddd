using Monitoring.Application;

namespace Monitoring.Infrastructure.Configuratie;

public sealed record MonitoringConfig(
    int Poort,
    string DatabaseUrl,
    string RabbitmqUrl,
    ValidatiePosture Validatie,
    AuthConfig Auth)
{
    public static MonitoringConfig Laad(Func<string, string?> getenv)
    {
        string Verplicht(string naam) =>
            getenv(naam) is { Length: > 0 } waarde
                ? waarde
                : throw new InvalidOperationException($"Ontbrekende omgevingsvariabele: {naam}");

        var poort = int.TryParse(getenv("SERVICE_PORT"), out var p) ? p : 8002;
        var validatie = getenv("KUNSTWERK_VALIDATIE") == "streng" ? ValidatiePosture.Streng : ValidatiePosture.Soepel;
        return new MonitoringConfig(
            poort, Verplicht("DATABASE_URL"), Verplicht("RABBITMQ_URL"), validatie, AuthConfig.Laad(getenv));
    }
}

/// <summary>
/// OIDC/JWT-instellingen. Gedeeld auth-contract dat alle services identiek volgen:
/// verifieer de handtekening via JWKS, controleer issuer + expiry, geen audience-check.
/// Schrijfacties vereisen de eigen context-rol (<see cref="VerplichteRol"/>) in
/// realm_access.roles. Staat <see cref="Ingeschakeld"/> op false, dan blijft alles anoniem.
/// </summary>
public sealed record AuthConfig(bool Ingeschakeld, string Issuer, string JwksUri, string VerplichteRol)
{
    public const string StandaardIssuer = "https://keycloak.joranit.com/realms/rws";
    public const string StandaardJwksUri = "https://keycloak.joranit.com/realms/rws/protocol/openid-connect/certs";
    public const string StandaardRol = "monitoring";

    public static AuthConfig Laad(Func<string, string?> getenv)
    {
        string OfStandaard(string naam, string standaard) =>
            getenv(naam) is { Length: > 0 } waarde ? waarde : standaard;

        var ingeschakeld = string.Equals(getenv("AUTH_ENABLED"), "true", StringComparison.OrdinalIgnoreCase);
        return new AuthConfig(
            ingeschakeld,
            OfStandaard("OIDC_ISSUER", StandaardIssuer),
            OfStandaard("OIDC_JWKS_URI", StandaardJwksUri),
            OfStandaard("OIDC_REQUIRED_ROLE", StandaardRol));
    }
}
