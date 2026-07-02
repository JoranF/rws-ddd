using Monitoring.Application;

namespace Monitoring.Infrastructure.Configuratie;

public sealed record MonitoringConfig(int Poort, string DatabaseUrl, string RabbitmqUrl, ValidatiePosture Validatie)
{
    public static MonitoringConfig Laad(Func<string, string?> getenv)
    {
        string Verplicht(string naam) =>
            getenv(naam) is { Length: > 0 } waarde
                ? waarde
                : throw new InvalidOperationException($"Ontbrekende omgevingsvariabele: {naam}");

        var poort = int.TryParse(getenv("SERVICE_PORT"), out var p) ? p : 8002;
        var validatie = getenv("KUNSTWERK_VALIDATIE") == "streng" ? ValidatiePosture.Streng : ValidatiePosture.Soepel;
        return new MonitoringConfig(poort, Verplicht("DATABASE_URL"), Verplicht("RABBITMQ_URL"), validatie);
    }
}
