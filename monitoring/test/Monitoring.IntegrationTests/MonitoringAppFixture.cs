using Microsoft.AspNetCore.Mvc.Testing;
using Testcontainers.PostgreSql;
using Testcontainers.RabbitMq;
using Xunit;

namespace Monitoring.IntegrationTests;

public sealed class MonitoringAppFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _pg = new PostgreSqlBuilder()
        .WithImage("postgres:16").WithDatabase("monitoring_db").WithUsername("rws").WithPassword("rws").Build();
    private readonly RabbitMqContainer _rabbit = new RabbitMqBuilder()
        .WithImage("rabbitmq:3-management").Build();

    public WebApplicationFactory<Program> Factory { get; private set; } = default!;
    public string AmqpUrl { get; private set; } = "";

    public async Task InitializeAsync()
    {
        await _pg.StartAsync();
        await _rabbit.StartAsync();

        var dbUrl = $"postgres://rws:rws@{_pg.Hostname}:{_pg.GetMappedPublicPort(5432)}/monitoring_db";
        AmqpUrl = _rabbit.GetConnectionString();

        Environment.SetEnvironmentVariable("SERVICE_PORT", "8002");
        Environment.SetEnvironmentVariable("DATABASE_URL", dbUrl);
        Environment.SetEnvironmentVariable("RABBITMQ_URL", AmqpUrl);
        Environment.SetEnvironmentVariable("KUNSTWERK_VALIDATIE", "soepel");

        Factory = new WebApplicationFactory<Program>();
        _ = Factory.Server; // forceer host-start: migrate-op-startup + hosted services (consumer/relay) draaien
    }

    public async Task DisposeAsync()
    {
        await Factory.DisposeAsync();
        await _rabbit.DisposeAsync();
        await _pg.DisposeAsync();
    }
}
