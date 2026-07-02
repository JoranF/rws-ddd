using Microsoft.EntityFrameworkCore;
using Monitoring.Api;
using Monitoring.Application;
using Monitoring.Application.Incidenten;
using Monitoring.Application.Metingen;
using Monitoring.Application.Rapporten;
using Monitoring.Application.Sessies;
using Monitoring.Domain.Analyse;
using Monitoring.Infrastructure;
using Monitoring.Infrastructure.Configuratie;
using Monitoring.Infrastructure.Messaging;
using Monitoring.Infrastructure.Persistence;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);
var config = MonitoringConfig.Laad(Environment.GetEnvironmentVariable);
builder.WebHost.UseUrls($"http://0.0.0.0:{config.Poort}");

// --- Infrastructuur ---
builder.Services.AddDbContext<MonitoringDbContext>(o => o.UseNpgsql(NpgsqlVerbinding.VanUrl(config.DatabaseUrl)));
builder.Services.AddSingleton(await RabbitMqConnectie.VerbindAsync(config.RabbitmqUrl));
builder.Services.AddSingleton<IBerichtKanaal, RabbitMqBerichtKanaal>();
builder.Services.AddSingleton<IIdGenerator, UuidIdGenerator>();
builder.Services.AddSingleton<IKlok, SysteemKlok>();
builder.Services.AddSingleton(new AnalyseService());

builder.Services.AddScoped<IMonitoringSessieRepository, EfMonitoringSessieRepository>();
builder.Services.AddScoped<IMetingRepository, EfMetingRepository>();
builder.Services.AddScoped<IIncidentRepository, EfIncidentRepository>();
builder.Services.AddScoped<IRapportRepository, EfRapportRepository>();
builder.Services.AddScoped<IKunstwerkenReadModel, EfKunstwerkenReadModel>();
builder.Services.AddScoped<IEventPublisher, OutboxEventPublisher>();
builder.Services.AddScoped<IOutboxStore, EfOutboxStore>();
builder.Services.AddScoped<IEventDedup, EfEventDedup>();
builder.Services.AddScoped<IKunstwerkenStore, EfKunstwerkenStore>();

// --- Use cases ---
builder.Services.AddScoped(sp => new StartMonitoringSessie(
    sp.GetRequiredService<IMonitoringSessieRepository>(), sp.GetRequiredService<IEventPublisher>(),
    sp.GetRequiredService<IKunstwerkenReadModel>(), sp.GetRequiredService<IIdGenerator>(),
    sp.GetRequiredService<IKlok>(), config.Validatie));
builder.Services.AddScoped(sp => new PauzeerMonitoringSessie(sp.GetRequiredService<IMonitoringSessieRepository>()));
builder.Services.AddScoped(sp => new HervatMonitoringSessie(sp.GetRequiredService<IMonitoringSessieRepository>()));
builder.Services.AddScoped(sp => new RondMonitoringSessieAf(
    sp.GetRequiredService<IMonitoringSessieRepository>(), sp.GetRequiredService<IKlok>()));
builder.Services.AddScoped(sp => new RegistreerMeting(
    sp.GetRequiredService<IMonitoringSessieRepository>(), sp.GetRequiredService<IMetingRepository>(),
    sp.GetRequiredService<IIncidentRepository>(), sp.GetRequiredService<IEventPublisher>(),
    sp.GetRequiredService<IKunstwerkenReadModel>(), sp.GetRequiredService<AnalyseService>(),
    sp.GetRequiredService<IIdGenerator>(), sp.GetRequiredService<IKlok>(), config.Validatie));
builder.Services.AddScoped(sp => new NeemIncidentInBehandeling(sp.GetRequiredService<IIncidentRepository>()));
builder.Services.AddScoped(sp => new LosIncidentOp(
    sp.GetRequiredService<IIncidentRepository>(), sp.GetRequiredService<IEventPublisher>(), sp.GetRequiredService<IKlok>()));
builder.Services.AddScoped(sp => new StelRapportOp(
    sp.GetRequiredService<IMetingRepository>(), sp.GetRequiredService<IIncidentRepository>(),
    sp.GetRequiredService<IRapportRepository>(), sp.GetRequiredService<IEventPublisher>(),
    sp.GetRequiredService<IIdGenerator>(), sp.GetRequiredService<IKlok>()));
builder.Services.AddScoped(sp => new StelNetwerkrapportageOp(
    sp.GetRequiredService<IKunstwerkenReadModel>(), sp.GetRequiredService<IMetingRepository>(),
    sp.GetRequiredService<IIncidentRepository>(), sp.GetRequiredService<IEventPublisher>(),
    sp.GetRequiredService<IIdGenerator>(), sp.GetRequiredService<IKlok>()));

// --- Hosted services ---
builder.Services.AddHostedService<BeheerKunstwerkConsumer>();
builder.Services.AddHostedService<OutboxRelay>();

builder.Services.AddOpenApi();

var app = builder.Build();

// migrate-op-startup
using (var scope = app.Services.CreateScope())
{
    await scope.ServiceProvider.GetRequiredService<MonitoringDbContext>().Database.MigrateAsync();
}

app.UseMiddleware<DomeinFoutMiddleware>();
app.MapOpenApi();
app.MapScalarApiReference("/api/docs");
app.MapMonitoringEndpoints();

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
