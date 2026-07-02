using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.IdentityModel.Tokens;
using Monitoring.Infrastructure.Configuratie;

namespace Monitoring.Api;

/// <summary>
/// JWT/OIDC-authenticatie voor de interface-laag. Volgt het gedeelde auth-contract:
/// verifieer de handtekening via de JWKS-uri (Authority), controleer issuer + expiry,
/// forceer GEEN audience-check. Elke geldige gebruiker mag lezen (GET); schrijfacties
/// (POST/PUT/PATCH/DELETE) vereisen de eigen context-rol in realm_access.roles.
///
/// Staat <c>AUTH_ENABLED</c> niet op "true", dan wordt auth NIET geregistreerd en blijft
/// alles anoniem (huidig gedrag — bestaande tests blijven groen).
/// </summary>
public static class Auth
{
    /// <summary>Policy die de eigen context-rol vereist voor schrijfacties.</summary>
    public const string SchrijfPolicy = "monitoring:schrijven";

    public static void VoegAuthToe(this IServiceCollection services, AuthConfig auth)
    {
        if (!auth.Ingeschakeld)
            return;

        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                // Authority => OIDC-discovery haalt de JWKS (auth.JwksUri) op en cachet de
                // signing-keys automatisch; ze worden periodiek ververst.
                options.Authority = auth.Issuer;
                options.RequireHttpsMetadata = true;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = auth.Issuer,
                    ValidateAudience = false, // Keycloak's aud varieert — bewust geen audience-check.
                    ValidateLifetime = true,
                };
            });

        services.AddAuthorization(options =>
        {
            options.AddPolicy(SchrijfPolicy, policy =>
                policy.RequireAuthenticatedUser()
                      .AddRequirements(new RealmRolRequirement(auth.VerplichteRol)));
        });

        services.AddSingleton<IAuthorizationHandler, RealmRolHandler>();
    }
}

/// <summary>Vereist dat <see cref="Rol"/> in de Keycloak-claim <c>realm_access.roles</c> zit.</summary>
public sealed class RealmRolRequirement(string rol) : IAuthorizationRequirement
{
    public string Rol { get; } = rol;
}

/// <summary>
/// Leest de rollen uit de Keycloak <c>realm_access</c>-claim. Keycloak levert die als
/// JSON-object (<c>{"roles":[...]}</c>); JwtBearer plakt dat als één string-claim.
/// </summary>
public sealed class RealmRolHandler : AuthorizationHandler<RealmRolRequirement>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context, RealmRolRequirement requirement)
    {
        if (HeeftRol(context.User, requirement.Rol))
            context.Succeed(requirement);

        return Task.CompletedTask;
    }

    private static bool HeeftRol(ClaimsPrincipal user, string rol)
    {
        var claim = user.FindFirst("realm_access");
        if (claim is null || string.IsNullOrWhiteSpace(claim.Value))
            return false;

        try
        {
            using var doc = JsonDocument.Parse(claim.Value);
            if (!doc.RootElement.TryGetProperty("roles", out var roles) ||
                roles.ValueKind != JsonValueKind.Array)
                return false;

            foreach (var r in roles.EnumerateArray())
            {
                if (r.ValueKind == JsonValueKind.String &&
                    string.Equals(r.GetString(), rol, StringComparison.Ordinal))
                    return true;
            }
        }
        catch (JsonException)
        {
            return false;
        }

        return false;
    }
}
