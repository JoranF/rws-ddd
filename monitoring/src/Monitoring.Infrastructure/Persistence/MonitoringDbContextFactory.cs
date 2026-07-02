using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Monitoring.Infrastructure.Persistence;

public class MonitoringDbContextFactory : IDesignTimeDbContextFactory<MonitoringDbContext>
{
    public MonitoringDbContext CreateDbContext(string[] args)
    {
        var url = Environment.GetEnvironmentVariable("DATABASE_URL")
                  ?? "postgres://rws:rws@localhost:5432/monitoring_db";
        var options = new DbContextOptionsBuilder<MonitoringDbContext>()
            .UseNpgsql(NpgsqlVerbinding.VanUrl(url))
            .Options;
        return new MonitoringDbContext(options);
    }
}
