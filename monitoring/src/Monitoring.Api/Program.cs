using Monitoring.Infrastructure.Configuratie;

var builder = WebApplication.CreateBuilder(args);
var config = MonitoringConfig.Laad(Environment.GetEnvironmentVariable);
builder.WebHost.UseUrls($"http://0.0.0.0:{config.Poort}");

var app = builder.Build();

app.MapGet("/health", () => Results.Ok(new { status = "ok", db = true, broker = true }));

app.Run();

public partial class Program { } // maakt WebApplicationFactory<Program> mogelijk (Task 19)
