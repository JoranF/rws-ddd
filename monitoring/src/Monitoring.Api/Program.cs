using Microsoft.EntityFrameworkCore;
using Monitoring.Infrastructure.Configuratie;
using Monitoring.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);
var config = MonitoringConfig.Laad(Environment.GetEnvironmentVariable);
builder.WebHost.UseUrls($"http://0.0.0.0:{config.Poort}");

builder.Services.AddDbContext<MonitoringDbContext>(o => o.UseNpgsql(NpgsqlVerbinding.VanUrl(config.DatabaseUrl)));

var app = builder.Build();

app.MapGet("/health", async (MonitoringDbContext db) =>
{
    var dbOk = await ProbeerAsync(async () => await db.Database.CanConnectAsync());
    var gezond = dbOk; // broker-check volgt in Task 3
    return Results.Json(new { status = gezond ? "ok" : "degraded", db = dbOk, broker = true },
        statusCode: gezond ? 200 : 503);
});

app.Run();

static async Task<bool> ProbeerAsync(Func<Task<bool>> check)
{
    try { return await check(); } catch { return false; }
}

public partial class Program { }
