using Monitoring.Infrastructure.Persistence;
using Xunit;

namespace Monitoring.UnitTests.Persistence;

public class NpgsqlVerbindingTests
{
    [Fact]
    public void Zet_een_postgres_url_om_naar_een_keyword_connectionstring()
    {
        var cs = NpgsqlVerbinding.VanUrl("postgres://rws:geheim@postgres:5432/monitoring_db");
        Assert.Contains("Host=postgres", cs);
        Assert.Contains("Port=5432", cs);
        Assert.Contains("Username=rws", cs);
        Assert.Contains("Password=geheim", cs);
        Assert.Contains("Database=monitoring_db", cs);
    }

    [Fact]
    public void Valt_terug_op_poort_5432_als_die_ontbreekt()
    {
        var cs = NpgsqlVerbinding.VanUrl("postgres://rws:rws@localhost/monitoring_db");
        Assert.Contains("Port=5432", cs);
    }
}
