using Microsoft.EntityFrameworkCore;
using Monitoring.Infrastructure.Configuratie;
using Monitoring.Infrastructure.Messaging;
using Monitoring.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);
var config = MonitoringConfig.Laad(Environment.GetEnvironmentVariable);
builder.WebHost.UseUrls($"http://0.0.0.0:{config.Poort}");

builder.Services.AddDbContext<MonitoringDbContext>(o => o.UseNpgsql(NpgsqlVerbinding.VanUrl(config.DatabaseUrl)));

var rabbit = await RabbitMqConnectie.VerbindAsync(config.RabbitmqUrl);
builder.Services.AddSingleton(rabbit);

var app = builder.Build();

app.MapGet("/health", async (MonitoringDbContext db, RabbitMqConnectie broker) =>
{
    var dbOk = await ProbeerAsync(async () => await db.Database.CanConnectAsync());
    var brokerOk = broker.IsVerbonden;
    var gezond = dbOk && brokerOk;
    return Results.Json(new { status = gezond ? "ok" : "degraded", db = dbOk, broker = brokerOk },
        statusCode: gezond ? 200 : 503);
});

app.Run();

static async Task<bool> ProbeerAsync(Func<Task<bool>> check)
{
    try { return await check(); } catch { return false; }
}

public partial class Program { }
