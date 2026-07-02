using Monitoring.Application;
using Monitoring.Infrastructure.Configuratie;
using Xunit;

namespace Monitoring.UnitTests.Configuratie;

public class MonitoringConfigTests
{
    private static Func<string, string?> Env(Dictionary<string, string?> d) => naam => d.GetValueOrDefault(naam);

    private static Dictionary<string, string?> Basis() => new()
    {
        ["SERVICE_PORT"] = "8002",
        ["DATABASE_URL"] = "postgres://rws:rws@postgres:5432/monitoring_db",
        ["RABBITMQ_URL"] = "amqp://rws:rws@rabbitmq:5672",
    };

    [Fact]
    public void Leest_de_poort_en_gebruikt_soepele_validatie_als_default()
    {
        var config = MonitoringConfig.Laad(Env(Basis()));
        Assert.Equal(8002, config.Poort);
        Assert.Equal(ValidatiePosture.Soepel, config.Validatie);
    }

    [Fact]
    public void Zet_validatie_op_streng_bij_de_juiste_vlag()
    {
        var env = Basis();
        env["KUNSTWERK_VALIDATIE"] = "streng";
        Assert.Equal(ValidatiePosture.Streng, MonitoringConfig.Laad(Env(env)).Validatie);
    }

    [Fact]
    public void Gooit_als_een_verplichte_variabele_ontbreekt()
    {
        var env = Basis();
        env.Remove("DATABASE_URL");
        var fout = Assert.Throws<InvalidOperationException>(() => MonitoringConfig.Laad(Env(env)));
        Assert.Contains("DATABASE_URL", fout.Message);
    }
}
