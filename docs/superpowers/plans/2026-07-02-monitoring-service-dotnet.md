# Monitoring-service (C# / .NET 10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bouw de Monitoring bounded context (Fase 1 + Fase 2) als zelfstandig draaiende C#/.NET-service: twee aggregates (MonitoringSessie + Incident), AnalyseService, MonitoringRapport, netwerkrapportage, alle gepubliceerde events via een transactionele outbox, REST + OpenAPI, een idempotente `beheer.kunstwerk.*`-consumer, strenge validatie, Docker + Testcontainers-integratietests.

**Architecture:** Multi-project .NET-solution met de afhankelijkheidsregel compile-afgedwongen via `<ProjectReference>`: `Monitoring.Domain` (nul refs) ← `Monitoring.Application` ← `Monitoring.Infrastructure` / `Monitoring.Api`. Domein is puur C# (geen EF/RabbitMQ). Bouwvolgorde: walking skeleton (solution/DB/broker/health) → domein met TDD → application-use-cases met in-memory fakes → infrastructure (EF Core-repos, RabbitMQ.Client, outbox+relay, consumer) → interface (Minimal APIs + Scalar) + composition root → Fase 2-hardening (streng, netwerkrapportage) → Docker + Testcontainers.

**Tech Stack:** .NET 10 (`net10.0`), ASP.NET Core (Minimal APIs), EF Core 10 + Npgsql (`Npgsql.EntityFrameworkCore.PostgreSQL` 10.0.2), RabbitMQ.Client 7.x (raw), `Microsoft.AspNetCore.OpenApi` + Scalar.AspNetCore 2.14.x, xUnit, Testcontainers 4.12 (PostgreSql + RabbitMq), `System.Text.Json`.

## Global Constraints

- Werk op branch **`monitoring-service`** (bestaat al, op `main` gebaseerd). Commit na elke taak.
- Alle code onder **`monitoring/`**. Solutionmap `monitoring/`, projecten onder `monitoring/src/` en `monitoring/test/`.
- Poort **8002** via `SERVICE_PORT`; DB via `DATABASE_URL` (`postgres://rws:rws@postgres:5432/monitoring_db`); broker via `RABBITMQ_URL` (`amqp://rws:rws@rabbitmq:5672`).
- `GET /health` geeft **200** zodra DB- en broker-connectie er zijn, anders **503**.
- Alle REST onder basispad **`/api`**.
- Events publiceren op durable topic-exchange **`rws.events`**, routing key `monitoring.<aggregate>.<event>`, met de **vaste envelope**: `{ eventId (uuid), eventType, occurredAt (ISO-8601 UTC), producer:"monitoring", version:1, data }`. Serialisatie **`System.Text.Json` camelCase** (byte-compatibel met de andere services).
- Consumers zijn **idempotent** (dedupe op `eventId` via de `VerwerktEvent`-tabel).
- Verwijs naar een kunstwerk via **`kunstwerkId`** (`KunstwerkReferentie`); kopieer geen beheer-model. Vertaal inkomende events aan de rand (`Infrastructure`) naar domeintaal.
- **`Monitoring.Domain` heeft nul projectreferenties** — geen EF, geen RabbitMQ, geen ASP.NET. Als je daar een `using` naar een framework nodig hebt, hoort de code niet in `Domain`.
- `KUNSTWERK_VALIDATIE` = `soepel` (default) of `streng` (Fase 2). Doorgegeven als `ValidatiePosture`-enum aan de use cases.
- Meetwaarden als **`double`** met vaste eenheid per `SensorType` (Trilling mm/s, Belasting kN, Temperatuur °C, Slijtage %); geen geld, geen centen-conversie.
- Een incident is een **feit + advies** (`Vervolgactie`); Monitoring beslist niet over het onderhoud.
- **`DATABASE_URL` is URI-vorm** (`postgres://…`); Npgsql parseert dat niet zelf — gebruik overal de `NpgsqlVerbinding.VanUrl(...)`-helper uit Task 2.
- Verwijder template-bestanden (`Class1.cs`, `UnitTest1.cs`, de weather-`Program.cs`-inhoud) zodra je ze vervangt.

### Projectreferentie-graaf (vast)

| Project | Refereert naar |
|---|---|
| `Monitoring.Domain` | — (niets) |
| `Monitoring.Application` | Domain |
| `Monitoring.Infrastructure` | Domain, Application |
| `Monitoring.Api` | Application, Infrastructure |
| `Monitoring.UnitTests` | Domain, Application, Infrastructure |
| `Monitoring.IntegrationTests` | Api, Infrastructure |

### Namespaces (vast — gebruik exact deze zodat taken op elkaar aansluiten)

- Domein gedeeld: `Monitoring.Domain.Gedeeld` (`DomeinFout`, ids, `SensorType`, `SensorData`, `Ernst`, `Vervolgactie`, `Afwijking`, `AggregateRoot`, `IDomainEvent`, event-records).
- Aggregates: `Monitoring.Domain.Sessies`, `Monitoring.Domain.Incidenten`, `Monitoring.Domain.Analyse`, `Monitoring.Domain.Rapporten`.
- Application: `Monitoring.Application` (ports, `ValidatiePosture`), `Monitoring.Application.Sessies`, `.Incidenten`, `.Rapporten`, `.Queries`.
- Infrastructure: `Monitoring.Infrastructure.Configuratie`, `.Persistence`, `.Persistence.Rows`, `.Messaging`.
- Api: `Monitoring.Api` (+ endpoint-klassen).

---

### Task 1: Solution- + projectscaffold + config + statische `/health`

Walking-skeleton-start: de volledige multi-project-solution bouwt en test groen; een ASP.NET-host draait op 8002 met een statische `/health`.

**Files:**
- Create (via CLI): `monitoring/Monitoring.sln` + de 6 projecten (zie stap 1).
- Create: `monitoring/src/Monitoring.Application/ValidatiePosture.cs`
- Create: `monitoring/src/Monitoring.Infrastructure/Configuratie/MonitoringConfig.cs`
- Create: `monitoring/src/Monitoring.Api/Program.cs` (overschrijf template)
- Create: `monitoring/test/Monitoring.UnitTests/Configuratie/MonitoringConfigTests.cs`
- Delete: template `Class1.cs` (Domain/Application/Infrastructure), `UnitTest1.cs` (beide testprojecten).

**Interfaces:**
- Produces: `enum ValidatiePosture { Soepel, Streng }` (namespace `Monitoring.Application`).
- Produces: `sealed record MonitoringConfig(int Poort, string DatabaseUrl, string RabbitmqUrl, ValidatiePosture Validatie)` met `static MonitoringConfig Laad(Func<string, string?> getenv)` (namespace `Monitoring.Infrastructure.Configuratie`).

- [ ] **Step 1: Scaffold de solution en projecten**

Run (in `monitoring/`):
```bash
dotnet new sln -n Monitoring
dotnet new classlib -n Monitoring.Domain -o src/Monitoring.Domain
dotnet new classlib -n Monitoring.Application -o src/Monitoring.Application
dotnet new classlib -n Monitoring.Infrastructure -o src/Monitoring.Infrastructure
dotnet new web -n Monitoring.Api -o src/Monitoring.Api
dotnet new xunit -n Monitoring.UnitTests -o test/Monitoring.UnitTests
dotnet new xunit -n Monitoring.IntegrationTests -o test/Monitoring.IntegrationTests
dotnet sln add src/Monitoring.Domain src/Monitoring.Application src/Monitoring.Infrastructure src/Monitoring.Api test/Monitoring.UnitTests test/Monitoring.IntegrationTests
dotnet add src/Monitoring.Application reference src/Monitoring.Domain
dotnet add src/Monitoring.Infrastructure reference src/Monitoring.Domain src/Monitoring.Application
dotnet add src/Monitoring.Api reference src/Monitoring.Application src/Monitoring.Infrastructure
dotnet add test/Monitoring.UnitTests reference src/Monitoring.Domain src/Monitoring.Application src/Monitoring.Infrastructure
dotnet add test/Monitoring.IntegrationTests reference src/Monitoring.Api src/Monitoring.Infrastructure
rm src/Monitoring.Domain/Class1.cs src/Monitoring.Application/Class1.cs src/Monitoring.Infrastructure/Class1.cs test/Monitoring.UnitTests/UnitTest1.cs test/Monitoring.IntegrationTests/UnitTest1.cs
```
Expected: alle projecten aangemaakt (target `net10.0`, Nullable + ImplicitUsings enabled by default). `dotnet build` slaagt.

- [ ] **Step 2: `ValidatiePosture`-enum**

`monitoring/src/Monitoring.Application/ValidatiePosture.cs`:
```csharp
namespace Monitoring.Application;

/// <summary>Fase 1 = Soepel (waarschuw bij onbekend kunstwerk), Fase 2 = Streng (weiger).</summary>
public enum ValidatiePosture
{
    Soepel,
    Streng,
}
```

- [ ] **Step 3: Write the failing test voor config**

`monitoring/test/Monitoring.UnitTests/Configuratie/MonitoringConfigTests.cs`:
```csharp
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
```

- [ ] **Step 4: Run test to verify it fails**

Run: `dotnet test test/Monitoring.UnitTests --filter FullyQualifiedName~MonitoringConfig`
Expected: FAIL — `MonitoringConfig` bestaat nog niet (compilefout).

- [ ] **Step 5: Implementeer `MonitoringConfig`**

`monitoring/src/Monitoring.Infrastructure/Configuratie/MonitoringConfig.cs`:
```csharp
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
```

- [ ] **Step 6: Run test to verify it passes**

Run: `dotnet test test/Monitoring.UnitTests --filter FullyQualifiedName~MonitoringConfig`
Expected: PASS (3 tests).

- [ ] **Step 7: Statische `/health` in `Program.cs`**

`monitoring/src/Monitoring.Api/Program.cs` (vervang de volledige template-inhoud):
```csharp
using Monitoring.Infrastructure.Configuratie;

var builder = WebApplication.CreateBuilder(args);
var config = MonitoringConfig.Laad(Environment.GetEnvironmentVariable);
builder.WebHost.UseUrls($"http://0.0.0.0:{config.Poort}");

var app = builder.Build();

app.MapGet("/health", () => Results.Ok(new { status = "ok", db = true, broker = true }));

app.Run();

public partial class Program { } // maakt WebApplicationFactory<Program> mogelijk (Task 19)
```

- [ ] **Step 8: Manuele verificatie**

Run:
```bash
SERVICE_PORT=8002 DATABASE_URL=x RABBITMQ_URL=x dotnet run --project src/Monitoring.Api &
sleep 3 && curl -s localhost:8002/health && echo && kill %1
```
Expected: `{"status":"ok","db":true,"broker":true}`, HTTP 200.

- [ ] **Step 9: Commit**

```bash
git add monitoring/
git commit -m "feat(monitoring): .NET-solutionscaffold met config en statische /health"
```

---

### Task 2: EF Core-bootstrap + read-model/idempotentie/outbox-tabellen + DB-health

Verbind met `monitoring_db`, definieer de eerste EF-tabellen (read-model, idempotentie, outbox) en laat `/health` de DB checken. Domeintabellen volgen in Task 13.

**Files:**
- Create: `monitoring/src/Monitoring.Infrastructure/Persistence/NpgsqlVerbinding.cs`
- Create: `monitoring/src/Monitoring.Infrastructure/Persistence/Rows/BekendKunstwerkRow.cs`
- Create: `monitoring/src/Monitoring.Infrastructure/Persistence/Rows/VerwerktEventRow.cs`
- Create: `monitoring/src/Monitoring.Infrastructure/Persistence/Rows/OutboxMessageRow.cs`
- Create: `monitoring/src/Monitoring.Infrastructure/Persistence/MonitoringDbContext.cs`
- Create: `monitoring/src/Monitoring.Infrastructure/Persistence/MonitoringDbContextFactory.cs`
- Create: `monitoring/src/Monitoring.Api/appsettings.json` blijft ongebruikt; config komt uit env.
- Modify: `monitoring/src/Monitoring.Api/Program.cs`
- Create: `monitoring/.env.example` (overschrijf bestaande met extra var)
- Test: `monitoring/test/Monitoring.UnitTests/Persistence/NpgsqlVerbindingTests.cs`

**Interfaces:**
- Produces: `static string NpgsqlVerbinding.VanUrl(string databaseUrl)` — zet `postgres://user:pass@host:port/db` om naar een Npgsql keyword-connectionstring.
- Produces: `class MonitoringDbContext(DbContextOptions<MonitoringDbContext> options) : DbContext` met `DbSet<BekendKunstwerkRow> BekendeKunstwerken`, `DbSet<VerwerktEventRow> VerwerkteEvents`, `DbSet<OutboxMessageRow> Outbox`.

- [ ] **Step 1: NuGet-packages**

Run (in `monitoring/`):
```bash
dotnet add src/Monitoring.Infrastructure package Npgsql.EntityFrameworkCore.PostgreSQL --version 10.0.2
dotnet add src/Monitoring.Infrastructure package Microsoft.EntityFrameworkCore.Design --version 10.0.4
dotnet add src/Monitoring.Api package Microsoft.EntityFrameworkCore.Design --version 10.0.4
dotnet tool install --global dotnet-ef --version 10.0.4 || dotnet tool update --global dotnet-ef --version 10.0.4
```
Expected: packages toegevoegd; `dotnet ef --version` werkt (≥ 10).

- [ ] **Step 2: Write the failing test voor de URL-parser**

`monitoring/test/Monitoring.UnitTests/Persistence/NpgsqlVerbindingTests.cs`:
```csharp
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `dotnet test test/Monitoring.UnitTests --filter FullyQualifiedName~NpgsqlVerbinding`
Expected: FAIL — klasse bestaat nog niet.

- [ ] **Step 4: Implementeer `NpgsqlVerbinding`**

`monitoring/src/Monitoring.Infrastructure/Persistence/NpgsqlVerbinding.cs`:
```csharp
using Npgsql;

namespace Monitoring.Infrastructure.Persistence;

public static class NpgsqlVerbinding
{
    /// <summary>Npgsql accepteert geen URI-vorm; zet postgres://user:pass@host:port/db om.</summary>
    public static string VanUrl(string databaseUrl)
    {
        var uri = new Uri(databaseUrl);
        var userInfo = uri.UserInfo.Split(':', 2);
        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.IsDefaultPort || uri.Port < 0 ? 5432 : uri.Port,
            Username = Uri.UnescapeDataString(userInfo[0]),
            Password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : string.Empty,
            Database = uri.AbsolutePath.TrimStart('/'),
        };
        return builder.ConnectionString;
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `dotnet test test/Monitoring.UnitTests --filter FullyQualifiedName~NpgsqlVerbinding`
Expected: PASS (2 tests).

- [ ] **Step 6: Row-entities**

`monitoring/src/Monitoring.Infrastructure/Persistence/Rows/BekendKunstwerkRow.cs`:
```csharp
namespace Monitoring.Infrastructure.Persistence.Rows;

public class BekendKunstwerkRow
{
    public string KunstwerkId { get; set; } = "";
    public string? Type { get; set; }
    public string? Locatie { get; set; }
    public bool InGebruik { get; set; } = true;
    public DateTime BijgewerktOp { get; set; }
}
```

`monitoring/src/Monitoring.Infrastructure/Persistence/Rows/VerwerktEventRow.cs`:
```csharp
namespace Monitoring.Infrastructure.Persistence.Rows;

public class VerwerktEventRow
{
    public string EventId { get; set; } = "";
    public DateTime VerwerktOp { get; set; }
}
```

`monitoring/src/Monitoring.Infrastructure/Persistence/Rows/OutboxMessageRow.cs`:
```csharp
namespace Monitoring.Infrastructure.Persistence.Rows;

public class OutboxMessageRow
{
    public string Id { get; set; } = "";          // = eventId uit de envelope
    public string EventType { get; set; } = "";
    public string RoutingKey { get; set; } = "";
    public string Payload { get; set; } = "";      // volledige envelope-JSON (jsonb)
    public bool Gepubliceerd { get; set; }
    public DateTime AangemaaktOp { get; set; }
    public DateTime? GepubliceerdOp { get; set; }
}
```

- [ ] **Step 7: `MonitoringDbContext`**

`monitoring/src/Monitoring.Infrastructure/Persistence/MonitoringDbContext.cs`:
```csharp
using Microsoft.EntityFrameworkCore;
using Monitoring.Infrastructure.Persistence.Rows;

namespace Monitoring.Infrastructure.Persistence;

public class MonitoringDbContext(DbContextOptions<MonitoringDbContext> options) : DbContext(options)
{
    public DbSet<BekendKunstwerkRow> BekendeKunstwerken => Set<BekendKunstwerkRow>();
    public DbSet<VerwerktEventRow> VerwerkteEvents => Set<VerwerktEventRow>();
    public DbSet<OutboxMessageRow> Outbox => Set<OutboxMessageRow>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<BekendKunstwerkRow>(e =>
        {
            e.ToTable("bekend_kunstwerk");
            e.HasKey(x => x.KunstwerkId);
        });

        b.Entity<VerwerktEventRow>(e =>
        {
            e.ToTable("verwerkt_event");
            e.HasKey(x => x.EventId);
        });

        b.Entity<OutboxMessageRow>(e =>
        {
            e.ToTable("outbox_message");
            e.HasKey(x => x.Id);
            e.Property(x => x.Payload).HasColumnType("jsonb");
            e.HasIndex(x => new { x.Gepubliceerd, x.AangemaaktOp });
        });
    }
}
```

- [ ] **Step 8: Design-time factory (voor `dotnet ef`)**

`monitoring/src/Monitoring.Infrastructure/Persistence/MonitoringDbContextFactory.cs`:
```csharp
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
```

- [ ] **Step 9: `.env.example` bijwerken**

`monitoring/.env.example` (overschrijf):
```
# Monitoring service — kopieer naar .env
SERVICE_PORT=8002
DATABASE_URL=postgres://rws:rws@postgres:5432/monitoring_db
RABBITMQ_URL=amqp://rws:rws@rabbitmq:5672
KUNSTWERK_VALIDATIE=soepel
```

- [ ] **Step 10: DbContext registreren + DB-health in `Program.cs`**

Vervang `monitoring/src/Monitoring.Api/Program.cs`:
```csharp
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
```

- [ ] **Step 11: Eerste migratie aanmaken**

Start infra vanuit de repo-root: `docker compose up -d postgres`.
Run (in `monitoring/`):
```bash
DATABASE_URL=postgres://rws:rws@localhost:5432/monitoring_db \
  dotnet ef migrations add InitReadModelOutbox \
  --project src/Monitoring.Infrastructure --startup-project src/Monitoring.Api \
  --output-dir Persistence/Migrations
```
Expected: migratiebestanden onder `src/Monitoring.Infrastructure/Persistence/Migrations/` met de drie tabellen.

- [ ] **Step 12: Manuele verificatie**

Run (in `monitoring/`):
```bash
DATABASE_URL=postgres://rws:rws@localhost:5432/monitoring_db \
  dotnet ef database update --project src/Monitoring.Infrastructure --startup-project src/Monitoring.Api
SERVICE_PORT=8002 DATABASE_URL=postgres://rws:rws@localhost:5432/monitoring_db RABBITMQ_URL=x \
  dotnet run --project src/Monitoring.Api &
sleep 4 && curl -s localhost:8002/health && echo && kill %1
```
Expected: `{"status":"ok","db":true,"broker":true}`. Stop postgres → `db:false` en HTTP 503.

- [ ] **Step 13: Commit**

```bash
git add monitoring/
git commit -m "feat(monitoring): EF Core-bootstrap met read-model/outbox-tabellen en DB-health"
```

---

### Task 3: RabbitMQ-connectie + broker-health

Bewijs broker-connectiviteit met RabbitMQ.Client 7.x (async). Nog geen event-mapping (die volgt na de domain-events).

**Files:**
- Create: `monitoring/src/Monitoring.Infrastructure/Messaging/RabbitMqConnectie.cs`
- Modify: `monitoring/src/Monitoring.Api/Program.cs`

**Interfaces:**
- Produces: `sealed class RabbitMqConnectie : IAsyncDisposable` met `const string Exchange = "rws.events"`, `static Task<RabbitMqConnectie> VerbindAsync(string url)`, `IChannel Kanaal { get; }`, `bool IsVerbonden { get; }`.

- [ ] **Step 1: NuGet-package**

Run: `dotnet add src/Monitoring.Infrastructure package RabbitMQ.Client --version 7.1.2`
Expected: RabbitMQ.Client 7.x toegevoegd (async API).

- [ ] **Step 2: Connectiemodule**

`monitoring/src/Monitoring.Infrastructure/Messaging/RabbitMqConnectie.cs`:
```csharp
using RabbitMQ.Client;

namespace Monitoring.Infrastructure.Messaging;

public sealed class RabbitMqConnectie : IAsyncDisposable
{
    public const string Exchange = "rws.events";

    private readonly IConnection _connectie;
    public IChannel Kanaal { get; }

    private RabbitMqConnectie(IConnection connectie, IChannel kanaal)
    {
        _connectie = connectie;
        Kanaal = kanaal;
    }

    public static async Task<RabbitMqConnectie> VerbindAsync(string url)
    {
        var factory = new ConnectionFactory { Uri = new Uri(url) };
        var connectie = await factory.CreateConnectionAsync();
        var kanaal = await connectie.CreateChannelAsync();
        await kanaal.ExchangeDeclareAsync(Exchange, ExchangeType.Topic, durable: true);
        return new RabbitMqConnectie(connectie, kanaal);
    }

    public bool IsVerbonden => _connectie.IsOpen && Kanaal.IsOpen;

    public async ValueTask DisposeAsync()
    {
        try { await Kanaal.CloseAsync(); } catch { /* al gesloten */ }
        try { await _connectie.CloseAsync(); } catch { /* al gesloten */ }
        _connectie.Dispose();
    }
}
```

- [ ] **Step 3: Broker-health koppelen in `Program.cs`**

Vervang `monitoring/src/Monitoring.Api/Program.cs`:
```csharp
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
```

- [ ] **Step 4: Manuele verificatie**

Run: repo-root `docker compose up -d rabbitmq postgres`; dan in `monitoring/`:
```bash
SERVICE_PORT=8002 DATABASE_URL=postgres://rws:rws@localhost:5432/monitoring_db \
  RABBITMQ_URL=amqp://rws:rws@localhost:5672 dotnet run --project src/Monitoring.Api &
sleep 5 && curl -s localhost:8002/health && echo && kill %1
```
Expected: `{"status":"ok","db":true,"broker":true}`. Open `http://localhost:15672` (rws/rws) → exchange `rws.events` bestaat (topic, durable).

- [ ] **Step 5: Commit**

```bash
git add monitoring/
git commit -m "feat(monitoring): RabbitMQ.Client-connectie en broker-health"
```

---

### Task 4: Domein — value objects (`Monitoring.Domain.Gedeeld`)

Pure value objects met invarianten. Volledig TDD; geen framework-imports. **Let op:** formatteer `double`-waarden in strings altijd met `CultureInfo.InvariantCulture` (anders `7,5` op een NL-machine).

**Files:**
- Create: `monitoring/src/Monitoring.Domain/Gedeeld/DomeinFout.cs`
- Create: `monitoring/src/Monitoring.Domain/Gedeeld/Eisen.cs`
- Create: `monitoring/src/Monitoring.Domain/Gedeeld/Identiteiten.cs`
- Create: `monitoring/src/Monitoring.Domain/Gedeeld/Sensor.cs`
- Create: `monitoring/src/Monitoring.Domain/Gedeeld/Ernst.cs`
- Create: `monitoring/src/Monitoring.Domain/Gedeeld/Vervolgactie.cs`
- Create: `monitoring/src/Monitoring.Domain/Gedeeld/Afwijking.cs`
- Test: `monitoring/test/Monitoring.UnitTests/Domein/WaardenTests.cs`
- Test: `monitoring/test/Monitoring.UnitTests/Domein/SensorTests.cs`

**Interfaces:**
- Produces: `sealed class DomeinFout : Exception`.
- Produces: `KunstwerkReferentie`, `SessieId`, `MetingId`, `IncidentId`, `RapportId` — elk `sealed record` met `string Waarde`, `static X Van(string)`.
- Produces: `enum SensorType { Trilling, Belasting, Temperatuur, Slijtage }`; `SensorType.StandaardEenheid()`; `sealed record SensorData { SensorType SensorType; double Waarde; string Eenheid; static SensorData Van(SensorType, double) }`.
- Produces: `enum Ernst { Laag, Middel, Hoog, Kritiek }`; `Ernst.Orde()`.
- Produces: `enum Vervolgactie { IntensieverMonitoren, Inspectie, Onderhoud }`; `Vervolgacties.Voor(Ernst)`.
- Produces: `sealed record Afwijking { SensorType SensorType; double GemetenWaarde; double Drempelwaarde; Ernst Ernst; DateTime Tijdstip; string Omschrijving; static Afwijking Van(SensorType, double gemetenWaarde, double drempelwaarde, Ernst, DateTime) }`.

- [ ] **Step 1: Write the failing tests**

`monitoring/test/Monitoring.UnitTests/Domein/WaardenTests.cs`:
```csharp
using Monitoring.Domain.Gedeeld;
using Xunit;

namespace Monitoring.UnitTests.Domein;

public class WaardenTests
{
    [Fact]
    public void KunstwerkReferentie_weigert_een_lege_waarde()
        => Assert.Throws<DomeinFout>(() => KunstwerkReferentie.Van(""));

    [Fact]
    public void KunstwerkReferentie_is_gelijk_bij_dezelfde_waarde()
        => Assert.Equal(KunstwerkReferentie.Van("KW-1"), KunstwerkReferentie.Van("KW-1"));

    [Fact]
    public void SessieId_weigert_een_lege_waarde()
        => Assert.Throws<DomeinFout>(() => SessieId.Van("   "));
}
```

`monitoring/test/Monitoring.UnitTests/Domein/SensorTests.cs`:
```csharp
using Monitoring.Domain.Gedeeld;
using Xunit;

namespace Monitoring.UnitTests.Domein;

public class SensorTests
{
    [Theory]
    [InlineData(SensorType.Trilling, "mm/s")]
    [InlineData(SensorType.Belasting, "kN")]
    [InlineData(SensorType.Temperatuur, "°C")]
    [InlineData(SensorType.Slijtage, "%")]
    public void SensorData_leidt_de_vaste_eenheid_af(SensorType type, string eenheid)
        => Assert.Equal(eenheid, SensorData.Van(type, 1).Eenheid);

    [Fact]
    public void SensorData_weigert_negatief_behalve_temperatuur()
    {
        Assert.Throws<DomeinFout>(() => SensorData.Van(SensorType.Belasting, -1));
        Assert.Equal(-5, SensorData.Van(SensorType.Temperatuur, -5).Waarde);
    }

    [Fact]
    public void SensorData_weigert_slijtage_boven_100()
        => Assert.Throws<DomeinFout>(() => SensorData.Van(SensorType.Slijtage, 101));

    [Theory]
    [InlineData(Ernst.Laag, Vervolgactie.IntensieverMonitoren)]
    [InlineData(Ernst.Middel, Vervolgactie.Inspectie)]
    [InlineData(Ernst.Hoog, Vervolgactie.Onderhoud)]
    [InlineData(Ernst.Kritiek, Vervolgactie.Onderhoud)]
    public void Vervolgactie_wordt_afgeleid_van_de_ernst(Ernst ernst, Vervolgactie verwacht)
        => Assert.Equal(verwacht, Vervolgacties.Voor(ernst));

    [Fact]
    public void Afwijking_weigert_een_waarde_onder_de_drempel()
        => Assert.Throws<DomeinFout>(() => Afwijking.Van(SensorType.Trilling, 3, 5, Ernst.Laag, DateTime.UtcNow));

    [Fact]
    public void Afwijking_beschrijft_zichzelf_met_waarde_drempel_en_eenheid()
    {
        var afwijking = Afwijking.Van(SensorType.Trilling, 7.5, 5, Ernst.Middel, DateTime.UtcNow);
        Assert.Equal("Trilling van 7.5 mm/s overschrijdt drempel 5 mm/s", afwijking.Omschrijving);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test test/Monitoring.UnitTests --filter FullyQualifiedName~Domein`
Expected: FAIL — types bestaan nog niet.

- [ ] **Step 3: `DomeinFout` + `Eisen`**

`monitoring/src/Monitoring.Domain/Gedeeld/DomeinFout.cs`:
```csharp
namespace Monitoring.Domain.Gedeeld;

public sealed class DomeinFout(string bericht) : Exception(bericht);
```

`monitoring/src/Monitoring.Domain/Gedeeld/Eisen.cs`:
```csharp
namespace Monitoring.Domain.Gedeeld;

internal static class Eisen
{
    public static string NietLeeg(string? waarde, string veld) =>
        string.IsNullOrWhiteSpace(waarde) ? throw new DomeinFout($"{veld} mag niet leeg zijn") : waarde;
}
```

- [ ] **Step 4: `Identiteiten`**

`monitoring/src/Monitoring.Domain/Gedeeld/Identiteiten.cs`:
```csharp
namespace Monitoring.Domain.Gedeeld;

public sealed record KunstwerkReferentie
{
    public string Waarde { get; }
    private KunstwerkReferentie(string waarde) => Waarde = waarde;
    public static KunstwerkReferentie Van(string waarde) => new(Eisen.NietLeeg(waarde, "kunstwerkId"));
    public override string ToString() => Waarde;
}

public sealed record SessieId
{
    public string Waarde { get; }
    private SessieId(string waarde) => Waarde = waarde;
    public static SessieId Van(string waarde) => new(Eisen.NietLeeg(waarde, "sessieId"));
    public override string ToString() => Waarde;
}

public sealed record MetingId
{
    public string Waarde { get; }
    private MetingId(string waarde) => Waarde = waarde;
    public static MetingId Van(string waarde) => new(Eisen.NietLeeg(waarde, "metingId"));
    public override string ToString() => Waarde;
}

public sealed record IncidentId
{
    public string Waarde { get; }
    private IncidentId(string waarde) => Waarde = waarde;
    public static IncidentId Van(string waarde) => new(Eisen.NietLeeg(waarde, "incidentId"));
    public override string ToString() => Waarde;
}

public sealed record RapportId
{
    public string Waarde { get; }
    private RapportId(string waarde) => Waarde = waarde;
    public static RapportId Van(string waarde) => new(Eisen.NietLeeg(waarde, "rapportId"));
    public override string ToString() => Waarde;
}
```

- [ ] **Step 5: `Sensor`, `Ernst`, `Vervolgactie`**

`monitoring/src/Monitoring.Domain/Gedeeld/Sensor.cs`:
```csharp
namespace Monitoring.Domain.Gedeeld;

public enum SensorType
{
    Trilling,
    Belasting,
    Temperatuur,
    Slijtage,
}

public static class Sensoren
{
    public static string StandaardEenheid(this SensorType type) => type switch
    {
        SensorType.Trilling => "mm/s",
        SensorType.Belasting => "kN",
        SensorType.Temperatuur => "°C",
        SensorType.Slijtage => "%",
        _ => throw new DomeinFout("onbekend sensortype"),
    };
}

public sealed record SensorData
{
    public SensorType SensorType { get; }
    public double Waarde { get; }
    public string Eenheid { get; }

    private SensorData(SensorType sensorType, double waarde, string eenheid)
    {
        SensorType = sensorType;
        Waarde = waarde;
        Eenheid = eenheid;
    }

    public static SensorData Van(SensorType sensorType, double waarde)
    {
        if (double.IsNaN(waarde) || double.IsInfinity(waarde))
            throw new DomeinFout("waarde moet een eindig getal zijn");
        if (waarde < 0 && sensorType != SensorType.Temperatuur)
            throw new DomeinFout($"{sensorType} mag niet negatief zijn");
        if (sensorType == SensorType.Slijtage && waarde > 100)
            throw new DomeinFout("slijtage is een percentage (0-100)");
        return new SensorData(sensorType, waarde, sensorType.StandaardEenheid());
    }
}
```

`monitoring/src/Monitoring.Domain/Gedeeld/Ernst.cs`:
```csharp
namespace Monitoring.Domain.Gedeeld;

public enum Ernst
{
    Laag,
    Middel,
    Hoog,
    Kritiek,
}

public static class Ernsten
{
    public static int Orde(this Ernst ernst) => ernst switch
    {
        Ernst.Laag => 1,
        Ernst.Middel => 2,
        Ernst.Hoog => 3,
        Ernst.Kritiek => 4,
        _ => 0,
    };
}
```

`monitoring/src/Monitoring.Domain/Gedeeld/Vervolgactie.cs`:
```csharp
namespace Monitoring.Domain.Gedeeld;

public enum Vervolgactie
{
    IntensieverMonitoren,
    Inspectie,
    Onderhoud,
}

public static class Vervolgacties
{
    public static Vervolgactie Voor(Ernst ernst) => ernst switch
    {
        Ernst.Laag => Vervolgactie.IntensieverMonitoren,
        Ernst.Middel => Vervolgactie.Inspectie,
        Ernst.Hoog or Ernst.Kritiek => Vervolgactie.Onderhoud,
        _ => throw new DomeinFout("onbekende ernst"),
    };
}
```

- [ ] **Step 6: `Afwijking`**

`monitoring/src/Monitoring.Domain/Gedeeld/Afwijking.cs`:
```csharp
using System.Globalization;

namespace Monitoring.Domain.Gedeeld;

public sealed record Afwijking
{
    public SensorType SensorType { get; }
    public double GemetenWaarde { get; }
    public double Drempelwaarde { get; }
    public Ernst Ernst { get; }
    public DateTime Tijdstip { get; }

    private Afwijking(SensorType sensorType, double gemetenWaarde, double drempelwaarde, Ernst ernst, DateTime tijdstip)
    {
        SensorType = sensorType;
        GemetenWaarde = gemetenWaarde;
        Drempelwaarde = drempelwaarde;
        Ernst = ernst;
        Tijdstip = tijdstip;
    }

    public static Afwijking Van(SensorType sensorType, double gemetenWaarde, double drempelwaarde, Ernst ernst, DateTime tijdstip)
    {
        if (gemetenWaarde < drempelwaarde)
            throw new DomeinFout("een afwijking vereist een waarde op of boven de drempel");
        return new Afwijking(sensorType, gemetenWaarde, drempelwaarde, ernst, tijdstip);
    }

    public string Omschrijving
    {
        get
        {
            var eenheid = SensorType.StandaardEenheid();
            return $"{SensorType} van {Getal(GemetenWaarde)} {eenheid} overschrijdt drempel {Getal(Drempelwaarde)} {eenheid}";
        }
    }

    private static string Getal(double d) => d.ToString(CultureInfo.InvariantCulture);
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `dotnet test test/Monitoring.UnitTests --filter FullyQualifiedName~Domein`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add monitoring/
git commit -m "feat(monitoring): domein-value-objects met invarianten"
```

---

### Task 5: Domein — `AggregateRoot` + domain-events + tijd-helper

Basisklasse voor event-registratie, de vier domain-event-records (payloads = `data`-velden uit `docs/events.md` + achterwaarts-compatibele extra velden) en een pure ISO-8601-helper.

**Files:**
- Create: `monitoring/src/Monitoring.Domain/Gedeeld/Tijd.cs`
- Create: `monitoring/src/Monitoring.Domain/Gedeeld/DomainEvents.cs`
- Create: `monitoring/src/Monitoring.Domain/Gedeeld/AggregateRoot.cs`
- Test: `monitoring/test/Monitoring.UnitTests/Domein/AggregateRootTests.cs`

**Interfaces:**
- Produces: `static string Tijd.NaarIso(this DateTime)` — `yyyy-MM-ddTHH:mm:ss.fffZ` (UTC), gelijk aan JS `toISOString()`.
- Produces: `interface IDomainEvent { string EventType { get; } IReadOnlyDictionary<string, object?> Data { get; } }`.
- Produces: records `MetingGeregistreerd`, `IncidentAangemaakt`, `IncidentOpgelost`, `RapportOpgesteld` (elk `: IDomainEvent`).
- Produces: `abstract class AggregateRoot { protected void RegistreerEvent(IDomainEvent); IReadOnlyList<IDomainEvent> TrekEventsLeeg(); }`.

- [ ] **Step 1: Write the failing test**

`monitoring/test/Monitoring.UnitTests/Domein/AggregateRootTests.cs`:
```csharp
using Monitoring.Domain.Gedeeld;
using Xunit;

namespace Monitoring.UnitTests.Domein;

public class AggregateRootTests
{
    private sealed class TestAggregate : AggregateRoot
    {
        public void Doe() => RegistreerEvent(new IncidentOpgelost("I1", "KW1", "2026-07-01T00:00:00.000Z"));
    }

    [Fact]
    public void Verzamelt_events_en_trekt_ze_daarna_leeg()
    {
        var t = new TestAggregate();
        t.Doe();
        var events = t.TrekEventsLeeg();
        Assert.Single(events);
        Assert.Equal("monitoring.incident.opgelost", events[0].EventType);
        Assert.Empty(t.TrekEventsLeeg());
    }

    [Fact]
    public void NaarIso_geeft_UTC_met_milliseconden_en_Z()
    {
        var iso = new DateTime(2026, 7, 1, 9, 0, 0, DateTimeKind.Utc).NaarIso();
        Assert.Equal("2026-07-01T09:00:00.000Z", iso);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test test/Monitoring.UnitTests --filter FullyQualifiedName~AggregateRoot`
Expected: FAIL — types ontbreken.

- [ ] **Step 3: `Tijd`-helper**

`monitoring/src/Monitoring.Domain/Gedeeld/Tijd.cs`:
```csharp
using System.Globalization;

namespace Monitoring.Domain.Gedeeld;

public static class Tijd
{
    public static string NaarIso(this DateTime moment) =>
        moment.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
```

- [ ] **Step 4: Domain-events**

`monitoring/src/Monitoring.Domain/Gedeeld/DomainEvents.cs`:
```csharp
namespace Monitoring.Domain.Gedeeld;

public interface IDomainEvent
{
    string EventType { get; }
    IReadOnlyDictionary<string, object?> Data { get; }
}

public sealed record MetingGeregistreerd(
    string MetingId, string SessieId, string KunstwerkId,
    string SensorType, double Waarde, string Eenheid, string Tijdstip) : IDomainEvent
{
    public string EventType => "monitoring.meting.geregistreerd";
    public IReadOnlyDictionary<string, object?> Data => new Dictionary<string, object?>
    {
        ["metingId"] = MetingId,
        ["sessieId"] = SessieId,
        ["kunstwerkId"] = KunstwerkId,
        ["sensorType"] = SensorType,
        ["waarde"] = Waarde,
        ["eenheid"] = Eenheid,
        ["tijdstip"] = Tijdstip,
    };
}

public sealed record IncidentAangemaakt(
    string IncidentId, string KunstwerkId, string Ernst, string Omschrijving,
    string SensorType, string Vervolgactie) : IDomainEvent
{
    public string EventType => "monitoring.incident.aangemaakt";
    public IReadOnlyDictionary<string, object?> Data => new Dictionary<string, object?>
    {
        ["incidentId"] = IncidentId,
        ["kunstwerkId"] = KunstwerkId,
        ["ernst"] = Ernst,
        ["omschrijving"] = Omschrijving,
        ["sensorType"] = SensorType,
        ["vervolgactie"] = Vervolgactie,
    };
}

public sealed record IncidentOpgelost(string IncidentId, string KunstwerkId, string Datum) : IDomainEvent
{
    public string EventType => "monitoring.incident.opgelost";
    public IReadOnlyDictionary<string, object?> Data => new Dictionary<string, object?>
    {
        ["incidentId"] = IncidentId,
        ["kunstwerkId"] = KunstwerkId,
        ["datum"] = Datum,
    };
}

public sealed record RapportOpgesteld(string KunstwerkId, string? IncidentId, object Resultaten) : IDomainEvent
{
    public string EventType => "monitoring.rapport.opgesteld";
    public IReadOnlyDictionary<string, object?> Data => new Dictionary<string, object?>
    {
        ["kunstwerkId"] = KunstwerkId,
        ["incidentId"] = IncidentId,
        ["resultaten"] = Resultaten,
    };
}
```

- [ ] **Step 5: `AggregateRoot`**

`monitoring/src/Monitoring.Domain/Gedeeld/AggregateRoot.cs`:
```csharp
namespace Monitoring.Domain.Gedeeld;

public abstract class AggregateRoot
{
    private readonly List<IDomainEvent> _events = new();

    protected void RegistreerEvent(IDomainEvent domeinEvent) => _events.Add(domeinEvent);

    public IReadOnlyList<IDomainEvent> TrekEventsLeeg()
    {
        var uit = _events.ToList();
        _events.Clear();
        return uit;
    }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `dotnet test test/Monitoring.UnitTests --filter FullyQualifiedName~AggregateRoot`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add monitoring/
git commit -m "feat(monitoring): AggregateRoot, domain-events en ISO-tijd-helper"
```

---

### Task 6: Domein — `MonitoringSessie`-aggregate + `Meting`

De sessie bewaakt de regels; de meting is een apart immutabel record dat de sessie retourneert (het aggregate draagt de meethistorie bewust niet zelf — alleen een teller).

**Files:**
- Create: `monitoring/src/Monitoring.Domain/Sessies/Meting.cs`
- Create: `monitoring/src/Monitoring.Domain/Sessies/MonitoringSessie.cs`
- Test: `monitoring/test/Monitoring.UnitTests/Domein/MonitoringSessieTests.cs`

**Interfaces:**
- Produces: `sealed record Meting(MetingId Id, SessieId SessieId, KunstwerkReferentie KunstwerkId, SensorData SensorData, DateTime Tijdstip)` (namespace `Monitoring.Domain.Sessies`).
- Produces: `enum MonitoringStatus { Actief, Gepauzeerd, Afgerond }`.
- Produces: `sealed class MonitoringSessie : AggregateRoot` met `Id, KunstwerkId, Status, GestartOp, BeeindigdOp, AantalMetingen`; `static Start(SessieId, KunstwerkReferentie, DateTime)`; `static Herstel(SessieId, KunstwerkReferentie, MonitoringStatus, DateTime, DateTime?, int)`; `Meting RegistreerMeting(MetingId, SensorData, DateTime)`; `void Pauzeer()`, `void Hervat()`, `void RondAf(DateTime)`.

- [ ] **Step 1: Write the failing test**

`monitoring/test/Monitoring.UnitTests/Domein/MonitoringSessieTests.cs`:
```csharp
using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Sessies;
using Xunit;

namespace Monitoring.UnitTests.Domein;

public class MonitoringSessieTests
{
    private static MonitoringSessie Nieuwe() => MonitoringSessie.Start(
        SessieId.Van("S1"), KunstwerkReferentie.Van("KW1"), new DateTime(2026, 7, 1, 8, 0, 0, DateTimeKind.Utc));

    [Fact]
    public void Start_als_Actief_met_nul_metingen()
    {
        var sessie = Nieuwe();
        Assert.Equal(MonitoringStatus.Actief, sessie.Status);
        Assert.Equal(0, sessie.AantalMetingen);
    }

    [Fact]
    public void Registreert_een_meting_verhoogt_de_teller_en_registreert_het_event()
    {
        var sessie = Nieuwe();
        var meting = sessie.RegistreerMeting(MetingId.Van("M1"), SensorData.Van(SensorType.Trilling, 3.5),
            new DateTime(2026, 7, 1, 9, 0, 0, DateTimeKind.Utc));

        Assert.Equal("S1", meting.SessieId.Waarde);
        Assert.Equal("KW1", meting.KunstwerkId.Waarde);
        Assert.Equal(1, sessie.AantalMetingen);

        var events = sessie.TrekEventsLeeg();
        Assert.Equal("monitoring.meting.geregistreerd", events[0].EventType);
        Assert.Equal("M1", events[0].Data["metingId"]);
        Assert.Equal(3.5, events[0].Data["waarde"]);
        Assert.Equal("mm/s", events[0].Data["eenheid"]);
    }

    [Fact]
    public void Weigert_meten_bij_een_gepauzeerde_sessie()
    {
        var sessie = Nieuwe();
        sessie.Pauzeer();
        Assert.Throws<DomeinFout>(() =>
            sessie.RegistreerMeting(MetingId.Van("M1"), SensorData.Van(SensorType.Trilling, 1), DateTime.UtcNow));
    }

    [Fact]
    public void Pauzeert_alleen_vanaf_Actief_en_hervat_alleen_vanaf_Gepauzeerd()
    {
        var sessie = Nieuwe();
        Assert.Throws<DomeinFout>(() => sessie.Hervat());
        sessie.Pauzeer();
        Assert.Equal(MonitoringStatus.Gepauzeerd, sessie.Status);
        Assert.Throws<DomeinFout>(() => sessie.Pauzeer());
        sessie.Hervat();
        Assert.Equal(MonitoringStatus.Actief, sessie.Status);
    }

    [Fact]
    public void Rondt_af_ook_vanaf_Gepauzeerd_en_blokkeert_daarna_alles()
    {
        var sessie = Nieuwe();
        sessie.Pauzeer();
        sessie.RondAf(new DateTime(2026, 7, 2, 8, 0, 0, DateTimeKind.Utc));
        Assert.Equal(MonitoringStatus.Afgerond, sessie.Status);
        Assert.Equal(new DateTime(2026, 7, 2, 8, 0, 0, DateTimeKind.Utc), sessie.BeeindigdOp);
        Assert.Throws<DomeinFout>(() => sessie.RondAf(DateTime.UtcNow));
        Assert.Throws<DomeinFout>(() => sessie.Hervat());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test test/Monitoring.UnitTests --filter FullyQualifiedName~MonitoringSessie`
Expected: FAIL — types ontbreken.

- [ ] **Step 3: `Meting`**

`monitoring/src/Monitoring.Domain/Sessies/Meting.cs`:
```csharp
using Monitoring.Domain.Gedeeld;

namespace Monitoring.Domain.Sessies;

public sealed record Meting(
    MetingId Id,
    SessieId SessieId,
    KunstwerkReferentie KunstwerkId,
    SensorData SensorData,
    DateTime Tijdstip);
```

- [ ] **Step 4: `MonitoringSessie`**

`monitoring/src/Monitoring.Domain/Sessies/MonitoringSessie.cs`:
```csharp
using Monitoring.Domain.Gedeeld;

namespace Monitoring.Domain.Sessies;

public enum MonitoringStatus
{
    Actief,
    Gepauzeerd,
    Afgerond,
}

public sealed class MonitoringSessie : AggregateRoot
{
    public SessieId Id { get; }
    public KunstwerkReferentie KunstwerkId { get; }
    public MonitoringStatus Status { get; private set; }
    public DateTime GestartOp { get; }
    public DateTime? BeeindigdOp { get; private set; }
    public int AantalMetingen { get; private set; }

    private MonitoringSessie(SessieId id, KunstwerkReferentie kunstwerkId, MonitoringStatus status,
        DateTime gestartOp, DateTime? beeindigdOp, int aantalMetingen)
    {
        Id = id;
        KunstwerkId = kunstwerkId;
        Status = status;
        GestartOp = gestartOp;
        BeeindigdOp = beeindigdOp;
        AantalMetingen = aantalMetingen;
    }

    public static MonitoringSessie Start(SessieId id, KunstwerkReferentie kunstwerkId, DateTime gestartOp) =>
        new(id, kunstwerkId, MonitoringStatus.Actief, gestartOp, null, 0);

    public static MonitoringSessie Herstel(SessieId id, KunstwerkReferentie kunstwerkId, MonitoringStatus status,
        DateTime gestartOp, DateTime? beeindigdOp, int aantalMetingen) =>
        new(id, kunstwerkId, status, gestartOp, beeindigdOp, aantalMetingen);

    public Meting RegistreerMeting(MetingId id, SensorData sensorData, DateTime tijdstip)
    {
        if (Status != MonitoringStatus.Actief)
            throw new DomeinFout("meten kan alleen bij een actieve sessie");
        AantalMetingen++;
        var meting = new Meting(id, Id, KunstwerkId, sensorData, tijdstip);
        RegistreerEvent(new MetingGeregistreerd(
            id.Waarde, Id.Waarde, KunstwerkId.Waarde,
            sensorData.SensorType.ToString(), sensorData.Waarde, sensorData.Eenheid, tijdstip.NaarIso()));
        return meting;
    }

    public void Pauzeer()
    {
        if (Status != MonitoringStatus.Actief)
            throw new DomeinFout("pauzeren kan alleen bij een actieve sessie");
        Status = MonitoringStatus.Gepauzeerd;
    }

    public void Hervat()
    {
        if (Status != MonitoringStatus.Gepauzeerd)
            throw new DomeinFout("hervatten kan alleen bij een gepauzeerde sessie");
        Status = MonitoringStatus.Actief;
    }

    public void RondAf(DateTime op)
    {
        if (Status == MonitoringStatus.Afgerond)
            throw new DomeinFout("sessie is al afgerond");
        Status = MonitoringStatus.Afgerond;
        BeeindigdOp = op;
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `dotnet test test/Monitoring.UnitTests --filter FullyQualifiedName~MonitoringSessie`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add monitoring/
git commit -m "feat(monitoring): MonitoringSessie-aggregate met Meting-record"
```

---

### Task 7: Domein — `Incident`-aggregate + `AnalyseService`

**Files:**
- Create: `monitoring/src/Monitoring.Domain/Incidenten/Incident.cs`
- Create: `monitoring/src/Monitoring.Domain/Analyse/AnalyseService.cs`
- Test: `monitoring/test/Monitoring.UnitTests/Domein/IncidentTests.cs`
- Test: `monitoring/test/Monitoring.UnitTests/Domein/AnalyseServiceTests.cs`

**Interfaces:**
- Produces: `enum IncidentStatus { Nieuw, InBehandeling, Opgelost }`.
- Produces: `sealed class Incident : AggregateRoot` met `Id, KunstwerkId, SensorType, GemetenWaarde, Drempelwaarde, Ernst, Omschrijving, Vervolgactie, Status, AangemaaktOp, OpgelostOp`; `static MaakAan(IncidentId, KunstwerkReferentie, Afwijking)`; `static Herstel(...)`; `void NeemInBehandeling()`, `void LosOp(DateTime)`.
- Produces: `sealed class AnalyseService` met `static IReadOnlyDictionary<SensorType, double> StandaardDrempels`; ctor `(IReadOnlyDictionary<SensorType, double>? drempels = null)`; `Afwijking? Analyseer(SensorData, DateTime)`.

- [ ] **Step 1: Write the failing tests**

`monitoring/test/Monitoring.UnitTests/Domein/AnalyseServiceTests.cs`:
```csharp
using Monitoring.Domain.Analyse;
using Monitoring.Domain.Gedeeld;
using Xunit;

namespace Monitoring.UnitTests.Domein;

public class AnalyseServiceTests
{
    private static readonly AnalyseService Analyse = new();
    private static readonly DateTime Tijdstip = new(2026, 7, 1, 9, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Geeft_null_onder_de_drempel()
        => Assert.Null(Analyse.Analyseer(SensorData.Van(SensorType.Trilling, 4.9), Tijdstip));

    [Theory]
    [InlineData(5, Ernst.Laag)]      // f = 1
    [InlineData(6.25, Ernst.Middel)] // f = 1.25
    [InlineData(7.5, Ernst.Hoog)]    // f = 1.5
    [InlineData(10, Ernst.Kritiek)]  // f = 2
    public void Leidt_de_ernst_af_van_de_overschrijdingsfactor(double waarde, Ernst verwacht)
        => Assert.Equal(verwacht, Analyse.Analyseer(SensorData.Van(SensorType.Trilling, waarde), Tijdstip)!.Ernst);

    [Fact]
    public void Gebruikt_de_drempel_per_sensortype()
    {
        Assert.Null(Analyse.Analyseer(SensorData.Van(SensorType.Belasting, 99), Tijdstip));
        Assert.Equal(40, Analyse.Analyseer(SensorData.Van(SensorType.Temperatuur, 41), Tijdstip)!.Drempelwaarde);
        Assert.Equal(60, Analyse.Analyseer(SensorData.Van(SensorType.Slijtage, 61), Tijdstip)!.Drempelwaarde);
    }

    [Fact]
    public void Accepteert_aangepaste_drempels()
    {
        var strenger = new AnalyseService(new Dictionary<SensorType, double>
        {
            [SensorType.Trilling] = 2, [SensorType.Belasting] = 100, [SensorType.Temperatuur] = 40, [SensorType.Slijtage] = 60,
        });
        Assert.Equal(Ernst.Kritiek, strenger.Analyseer(SensorData.Van(SensorType.Trilling, 4), Tijdstip)!.Ernst); // f = 2
    }
}
```

`monitoring/test/Monitoring.UnitTests/Domein/IncidentTests.cs`:
```csharp
using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Incidenten;
using Xunit;

namespace Monitoring.UnitTests.Domein;

public class IncidentTests
{
    private static Incident Nieuw(Ernst ernst = Ernst.Hoog) => Incident.MaakAan(
        IncidentId.Van("I1"), KunstwerkReferentie.Van("KW1"),
        Afwijking.Van(SensorType.Trilling, 7.5, 5, ernst, new DateTime(2026, 7, 1, 9, 0, 0, DateTimeKind.Utc)));

    [Fact]
    public void Ontstaat_als_Nieuw_met_afgeleide_omschrijving_en_vervolgactie_en_registreert_het_event()
    {
        var incident = Nieuw(Ernst.Hoog);
        Assert.Equal(IncidentStatus.Nieuw, incident.Status);
        Assert.Equal(Vervolgactie.Onderhoud, incident.Vervolgactie);
        Assert.Equal("Trilling van 7.5 mm/s overschrijdt drempel 5 mm/s", incident.Omschrijving);
        var events = incident.TrekEventsLeeg();
        Assert.Equal("monitoring.incident.aangemaakt", events[0].EventType);
        Assert.Equal("I1", events[0].Data["incidentId"]);
        Assert.Equal("Onderhoud", events[0].Data["vervolgactie"]);
    }

    [Theory]
    [InlineData(Ernst.Laag, Vervolgactie.IntensieverMonitoren)]
    [InlineData(Ernst.Middel, Vervolgactie.Inspectie)]
    public void Leidt_de_vervolgactie_af(Ernst ernst, Vervolgactie verwacht)
        => Assert.Equal(verwacht, Nieuw(ernst).Vervolgactie);

    [Fact]
    public void Kan_in_behandeling_genomen_worden_maar_alleen_vanaf_Nieuw()
    {
        var incident = Nieuw();
        incident.NeemInBehandeling();
        Assert.Equal(IncidentStatus.InBehandeling, incident.Status);
        Assert.Throws<DomeinFout>(() => incident.NeemInBehandeling());
    }

    [Fact]
    public void Lost_op_en_registreert_het_event()
    {
        var incident = Nieuw();
        incident.TrekEventsLeeg();
        incident.LosOp(new DateTime(2026, 7, 3, 10, 0, 0, DateTimeKind.Utc));
        Assert.Equal(IncidentStatus.Opgelost, incident.Status);
        var events = incident.TrekEventsLeeg();
        Assert.Equal("monitoring.incident.opgelost", events[0].EventType);
        Assert.Equal("2026-07-03T10:00:00.000Z", events[0].Data["datum"]);
    }

    [Fact]
    public void Is_maar_een_keer_oplosbaar()
    {
        var incident = Nieuw();
        incident.LosOp(DateTime.UtcNow);
        Assert.Throws<DomeinFout>(() => incident.LosOp(DateTime.UtcNow));
        Assert.Throws<DomeinFout>(() => incident.NeemInBehandeling());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test test/Monitoring.UnitTests --filter "FullyQualifiedName~Incident|FullyQualifiedName~AnalyseService"`
Expected: FAIL — types ontbreken.

- [ ] **Step 3: `AnalyseService`**

`monitoring/src/Monitoring.Domain/Analyse/AnalyseService.cs`:
```csharp
using Monitoring.Domain.Gedeeld;

namespace Monitoring.Domain.Analyse;

public sealed class AnalyseService
{
    public static readonly IReadOnlyDictionary<SensorType, double> StandaardDrempels = new Dictionary<SensorType, double>
    {
        [SensorType.Trilling] = 5,    // mm/s
        [SensorType.Belasting] = 100, // kN
        [SensorType.Temperatuur] = 40, // °C
        [SensorType.Slijtage] = 60,   // %
    };

    private readonly IReadOnlyDictionary<SensorType, double> _drempels;

    public AnalyseService(IReadOnlyDictionary<SensorType, double>? drempels = null) =>
        _drempels = drempels ?? StandaardDrempels;

    public Afwijking? Analyseer(SensorData sensorData, DateTime tijdstip)
    {
        var drempel = _drempels[sensorData.SensorType];
        var factor = sensorData.Waarde / drempel;
        if (factor < 1) return null;
        var ernst = factor < 1.25 ? Ernst.Laag
            : factor < 1.5 ? Ernst.Middel
            : factor < 2 ? Ernst.Hoog
            : Ernst.Kritiek;
        return Afwijking.Van(sensorData.SensorType, sensorData.Waarde, drempel, ernst, tijdstip);
    }
}
```

- [ ] **Step 4: `Incident`**

`monitoring/src/Monitoring.Domain/Incidenten/Incident.cs`:
```csharp
using Monitoring.Domain.Gedeeld;

namespace Monitoring.Domain.Incidenten;

public enum IncidentStatus
{
    Nieuw,
    InBehandeling,
    Opgelost,
}

public sealed class Incident : AggregateRoot
{
    public IncidentId Id { get; }
    public KunstwerkReferentie KunstwerkId { get; }
    public SensorType SensorType { get; }
    public double GemetenWaarde { get; }
    public double Drempelwaarde { get; }
    public Ernst Ernst { get; }
    public string Omschrijving { get; }
    public Vervolgactie Vervolgactie { get; }
    public IncidentStatus Status { get; private set; }
    public DateTime AangemaaktOp { get; }
    public DateTime? OpgelostOp { get; private set; }

    private Incident(IncidentId id, KunstwerkReferentie kunstwerkId, SensorType sensorType, double gemetenWaarde,
        double drempelwaarde, Ernst ernst, string omschrijving, Vervolgactie vervolgactie, IncidentStatus status,
        DateTime aangemaaktOp, DateTime? opgelostOp)
    {
        Id = id;
        KunstwerkId = kunstwerkId;
        SensorType = sensorType;
        GemetenWaarde = gemetenWaarde;
        Drempelwaarde = drempelwaarde;
        Ernst = ernst;
        Omschrijving = omschrijving;
        Vervolgactie = vervolgactie;
        Status = status;
        AangemaaktOp = aangemaaktOp;
        OpgelostOp = opgelostOp;
    }

    public static Incident MaakAan(IncidentId id, KunstwerkReferentie kunstwerkId, Afwijking afwijking)
    {
        var vervolgactie = Vervolgacties.Voor(afwijking.Ernst);
        var incident = new Incident(id, kunstwerkId, afwijking.SensorType, afwijking.GemetenWaarde,
            afwijking.Drempelwaarde, afwijking.Ernst, afwijking.Omschrijving, vervolgactie,
            IncidentStatus.Nieuw, afwijking.Tijdstip, null);
        incident.RegistreerEvent(new IncidentAangemaakt(
            id.Waarde, kunstwerkId.Waarde, afwijking.Ernst.ToString(), afwijking.Omschrijving,
            afwijking.SensorType.ToString(), vervolgactie.ToString()));
        return incident;
    }

    public static Incident Herstel(IncidentId id, KunstwerkReferentie kunstwerkId, SensorType sensorType,
        double gemetenWaarde, double drempelwaarde, Ernst ernst, string omschrijving, Vervolgactie vervolgactie,
        IncidentStatus status, DateTime aangemaaktOp, DateTime? opgelostOp) =>
        new(id, kunstwerkId, sensorType, gemetenWaarde, drempelwaarde, ernst, omschrijving, vervolgactie, status, aangemaaktOp, opgelostOp);

    public void NeemInBehandeling()
    {
        if (Status != IncidentStatus.Nieuw)
            throw new DomeinFout("in behandeling nemen kan alleen vanaf Nieuw");
        Status = IncidentStatus.InBehandeling;
    }

    public void LosOp(DateTime datum)
    {
        if (Status == IncidentStatus.Opgelost)
            throw new DomeinFout("incident is al opgelost");
        Status = IncidentStatus.Opgelost;
        OpgelostOp = datum;
        RegistreerEvent(new IncidentOpgelost(Id.Waarde, KunstwerkId.Waarde, datum.NaarIso()));
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `dotnet test test/Monitoring.UnitTests --filter "FullyQualifiedName~Incident|FullyQualifiedName~AnalyseService"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add monitoring/
git commit -m "feat(monitoring): Incident-aggregate en AnalyseService met afwijkingsdetectie"
```

---

### Task 8: Domein — `MonitoringRapport` (write-once)

Write-once domeinobject met factory die de resultaten in het domein berekent (per sensortype aantal/min/max/gemiddelde; incidenttellingen + `incidentIds`), het zwaarste openstaande incident kiest en het event registreert.

**Files:**
- Create: `monitoring/src/Monitoring.Domain/Rapporten/RapportResultaten.cs`
- Create: `monitoring/src/Monitoring.Domain/Rapporten/MonitoringRapport.cs`
- Test: `monitoring/test/Monitoring.UnitTests/Domein/MonitoringRapportTests.cs`

**Interfaces:**
- Produces: `sealed record SensorSamenvatting(string SensorType, int Aantal, double Min, double Max, double Gemiddelde)`.
- Produces: `sealed record RapportResultaten(IReadOnlyList<SensorSamenvatting> PerSensor, int TotaalIncidenten, int OpenIncidenten, int OpgelosteIncidenten, IReadOnlyList<string> IncidentIds)`.
- Produces: `sealed class MonitoringRapport : AggregateRoot` met `Id, KunstwerkId, PeriodeStart, PeriodeEind, ZwaarsteOpenIncident (IncidentId?), Resultaten (RapportResultaten), OpgesteldOp`; `static StelOp(RapportId, KunstwerkReferentie, DateTime periodeStart, DateTime periodeEind, IReadOnlyList<Meting>, IReadOnlyList<Incident>, DateTime opgesteldOp)`.

- [ ] **Step 1: Write the failing test**

`monitoring/test/Monitoring.UnitTests/Domein/MonitoringRapportTests.cs`:
```csharp
using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Incidenten;
using Monitoring.Domain.Rapporten;
using Monitoring.Domain.Sessies;
using Xunit;

namespace Monitoring.UnitTests.Domein;

public class MonitoringRapportTests
{
    private static Meting Meting(double waarde, SensorType type = SensorType.Trilling) =>
        new(MetingId.Van($"M{waarde}"), SessieId.Van("S1"), KunstwerkReferentie.Van("KW1"),
            SensorData.Van(type, waarde), new DateTime(2026, 7, 1, 9, 0, 0, DateTimeKind.Utc));

    private static Incident Incident(string id, Ernst ernst, bool opgelost)
    {
        var i = Incidenten.Incident.MaakAan(IncidentId.Van(id), KunstwerkReferentie.Van("KW1"),
            Afwijking.Van(SensorType.Trilling, 7.5, 5, ernst, new DateTime(2026, 7, 1, 9, 0, 0, DateTimeKind.Utc)));
        if (opgelost) i.LosOp(DateTime.UtcNow);
        return i;
    }

    [Fact]
    public void Berekent_samenvattingen_kiest_zwaarste_open_incident_en_registreert_het_event()
    {
        var metingen = new List<Meting> { Meting(2), Meting(4), Meting(6) };
        var incidenten = new List<Incident>
        {
            Incident("I-laag", Ernst.Laag, opgelost: false),
            Incident("I-hoog", Ernst.Hoog, opgelost: false),
            Incident("I-op", Ernst.Kritiek, opgelost: true),
        };

        var rapport = MonitoringRapport.StelOp(
            RapportId.Van("R1"), KunstwerkReferentie.Van("KW1"),
            new DateTime(2026, 7, 1, 0, 0, 0, DateTimeKind.Utc), new DateTime(2026, 7, 2, 0, 0, 0, DateTimeKind.Utc),
            metingen, incidenten, new DateTime(2026, 7, 2, 12, 0, 0, DateTimeKind.Utc));

        var trilling = Assert.Single(rapport.Resultaten.PerSensor);
        Assert.Equal(3, trilling.Aantal);
        Assert.Equal(2, trilling.Min);
        Assert.Equal(6, trilling.Max);
        Assert.Equal(4, trilling.Gemiddelde);

        Assert.Equal(3, rapport.Resultaten.TotaalIncidenten);
        Assert.Equal(2, rapport.Resultaten.OpenIncidenten);
        Assert.Equal(1, rapport.Resultaten.OpgelosteIncidenten);
        Assert.Equal("I-hoog", rapport.ZwaarsteOpenIncident!.Waarde); // zwaarste van de OPEN incidenten

        var events = rapport.TrekEventsLeeg();
        Assert.Equal("monitoring.rapport.opgesteld", events[0].EventType);
        Assert.Equal("I-hoog", events[0].Data["incidentId"]);
    }

    [Fact]
    public void ZwaarsteOpenIncident_is_null_zonder_open_incidenten()
    {
        var rapport = MonitoringRapport.StelOp(
            RapportId.Van("R2"), KunstwerkReferentie.Van("KW1"),
            new DateTime(2026, 7, 1, 0, 0, 0, DateTimeKind.Utc), new DateTime(2026, 7, 2, 0, 0, 0, DateTimeKind.Utc),
            new List<Meting>(), new List<Incident>(), new DateTime(2026, 7, 2, 12, 0, 0, DateTimeKind.Utc));
        Assert.Null(rapport.ZwaarsteOpenIncident);
        Assert.Empty(rapport.Resultaten.PerSensor);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test test/Monitoring.UnitTests --filter FullyQualifiedName~MonitoringRapport`
Expected: FAIL — types ontbreken.

- [ ] **Step 3: `RapportResultaten`**

`monitoring/src/Monitoring.Domain/Rapporten/RapportResultaten.cs`:
```csharp
namespace Monitoring.Domain.Rapporten;

public sealed record SensorSamenvatting(string SensorType, int Aantal, double Min, double Max, double Gemiddelde);

public sealed record RapportResultaten(
    IReadOnlyList<SensorSamenvatting> PerSensor,
    int TotaalIncidenten,
    int OpenIncidenten,
    int OpgelosteIncidenten,
    IReadOnlyList<string> IncidentIds);
```

- [ ] **Step 4: `MonitoringRapport`**

`monitoring/src/Monitoring.Domain/Rapporten/MonitoringRapport.cs`:
```csharp
using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Incidenten;
using Monitoring.Domain.Sessies;

namespace Monitoring.Domain.Rapporten;

public sealed class MonitoringRapport : AggregateRoot
{
    public RapportId Id { get; }
    public KunstwerkReferentie KunstwerkId { get; }
    public DateTime PeriodeStart { get; }
    public DateTime PeriodeEind { get; }
    public IncidentId? ZwaarsteOpenIncident { get; }
    public RapportResultaten Resultaten { get; }
    public DateTime OpgesteldOp { get; }

    private MonitoringRapport(RapportId id, KunstwerkReferentie kunstwerkId, DateTime periodeStart, DateTime periodeEind,
        IncidentId? zwaarsteOpenIncident, RapportResultaten resultaten, DateTime opgesteldOp)
    {
        Id = id;
        KunstwerkId = kunstwerkId;
        PeriodeStart = periodeStart;
        PeriodeEind = periodeEind;
        ZwaarsteOpenIncident = zwaarsteOpenIncident;
        Resultaten = resultaten;
        OpgesteldOp = opgesteldOp;
    }

    public static MonitoringRapport StelOp(RapportId id, KunstwerkReferentie kunstwerkId, DateTime periodeStart,
        DateTime periodeEind, IReadOnlyList<Meting> metingen, IReadOnlyList<Incident> incidenten, DateTime opgesteldOp)
    {
        var perSensor = metingen
            .GroupBy(m => m.SensorData.SensorType)
            .OrderBy(g => g.Key)
            .Select(g => new SensorSamenvatting(
                g.Key.ToString(), g.Count(),
                g.Min(m => m.SensorData.Waarde), g.Max(m => m.SensorData.Waarde), g.Average(m => m.SensorData.Waarde)))
            .ToList();

        var open = incidenten.Where(i => i.Status != IncidentStatus.Opgelost).ToList();
        var zwaarste = open
            .OrderByDescending(i => i.Ernst.Orde())
            .ThenByDescending(i => i.AangemaaktOp)
            .FirstOrDefault();

        var resultaten = new RapportResultaten(
            perSensor,
            TotaalIncidenten: incidenten.Count,
            OpenIncidenten: open.Count,
            OpgelosteIncidenten: incidenten.Count(i => i.Status == IncidentStatus.Opgelost),
            IncidentIds: incidenten.Select(i => i.Id.Waarde).ToList());

        var rapport = new MonitoringRapport(id, kunstwerkId, periodeStart, periodeEind, zwaarste?.Id, resultaten, opgesteldOp);
        rapport.RegistreerEvent(new RapportOpgesteld(kunstwerkId.Waarde, zwaarste?.Id.Waarde, resultaten));
        return rapport;
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `dotnet test test/Monitoring.UnitTests --filter FullyQualifiedName~MonitoringRapport`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add monitoring/
git commit -m "feat(monitoring): MonitoringRapport met write-once berekening"
```

---

### Task 9: Application — ports, kunstwerkbewaking, fakes + sessie-lifecycle-use-cases

Definieer alle ports (interfaces), de gedeelde kunstwerk-validatie, de in-memory fakes voor TDD, en de vier sessie-lifecycle-use-cases.

**Files:**
- Create: `monitoring/src/Monitoring.Application/Ports.cs`
- Create: `monitoring/src/Monitoring.Application/Kunstwerkbewaking.cs`
- Create: `monitoring/src/Monitoring.Application/Sessies/StartMonitoringSessie.cs`
- Create: `monitoring/src/Monitoring.Application/Sessies/SessieLevenscyclus.cs`
- Create: `monitoring/test/Monitoring.UnitTests/Support/Fakes.cs`
- Test: `monitoring/test/Monitoring.UnitTests/Applicatie/SessieUseCasesTests.cs`

**Interfaces:**
- Produces (namespace `Monitoring.Application`): `IMonitoringSessieRepository`, `IMetingRepository`, `IIncidentRepository`, `IRapportRepository`, `IEventPublisher`, `IKunstwerkenReadModel`, `IIdGenerator`, `IKlok` (exacte signatures hieronder).
- Produces: `static Task Kunstwerkbewaking.BewaakAsync(IKunstwerkenReadModel, ValidatiePosture, KunstwerkReferentie)`.
- Produces: `StartMonitoringSessie` (`Task<string> UitvoerenAsync(StartMonitoringSessieCommand)`), `PauzeerMonitoringSessie`, `HervatMonitoringSessie`, `RondMonitoringSessieAf` (elk `Task UitvoerenAsync(string sessieId)`).
- Produces (in testproject, namespace `Monitoring.UnitTests.Support`): `InMemorySessieRepository`, `InMemoryMetingRepository`, `InMemoryIncidentRepository`, `InMemoryRapportRepository`, `FakeEventPublisher`, `FakeKunstwerkenReadModel`, `VasteIdGenerator`, `VasteKlok`.

- [ ] **Step 1: Ports**

`monitoring/src/Monitoring.Application/Ports.cs`:
```csharp
using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Incidenten;
using Monitoring.Domain.Rapporten;
using Monitoring.Domain.Sessies;

namespace Monitoring.Application;

public interface IMonitoringSessieRepository
{
    Task BewaarAsync(MonitoringSessie sessie);
    Task<MonitoringSessie?> ZoekAsync(SessieId id);
    Task<IReadOnlyList<MonitoringSessie>> ZoekAlleAsync();
    Task<MonitoringSessie?> ZoekLopendeVoorKunstwerkAsync(KunstwerkReferentie kunstwerkId);
}

public interface IMetingRepository
{
    Task VoegToeAsync(Meting meting);
    Task<IReadOnlyList<Meting>> ZoekAsync(KunstwerkReferentie kunstwerkId, SensorType? sensorType);
    Task<IReadOnlyList<Meting>> ZoekInPeriodeAsync(KunstwerkReferentie kunstwerkId, DateTime start, DateTime eind);
}

public interface IIncidentRepository
{
    Task BewaarAsync(Incident incident);
    Task<Incident?> ZoekAsync(IncidentId id);
    Task<IReadOnlyList<Incident>> ZoekAsync(IncidentStatus? status, KunstwerkReferentie? kunstwerkId);
    Task<IReadOnlyList<Incident>> ZoekInPeriodeAsync(KunstwerkReferentie kunstwerkId, DateTime start, DateTime eind);
}

public interface IRapportRepository
{
    Task BewaarAsync(MonitoringRapport rapport);
    Task<MonitoringRapport?> ZoekAsync(RapportId id);
    Task<IReadOnlyList<MonitoringRapport>> ZoekAsync(KunstwerkReferentie? kunstwerkId);
}

public interface IEventPublisher
{
    Task PubliceerAsync(IReadOnlyList<IDomainEvent> events);
}

public interface IKunstwerkenReadModel
{
    Task<bool> IsBekendEnInGebruikAsync(KunstwerkReferentie kunstwerkId);
    Task<IReadOnlyList<KunstwerkReferentie>> AlleInGebruikAsync();
}

public interface IIdGenerator
{
    string Nieuw();
}

public interface IKlok
{
    DateTime Nu();
}
```

- [ ] **Step 2: Kunstwerkbewaking**

`monitoring/src/Monitoring.Application/Kunstwerkbewaking.cs`:
```csharp
using Monitoring.Domain.Gedeeld;

namespace Monitoring.Application;

public static class Kunstwerkbewaking
{
    /// <summary>Streng: weiger onbekend/buitengebruikgesteld kunstwerk. Soepel: laat door.</summary>
    public static async Task BewaakAsync(IKunstwerkenReadModel kunstwerken, ValidatiePosture validatie, KunstwerkReferentie kunstwerkId)
    {
        if (await kunstwerken.IsBekendEnInGebruikAsync(kunstwerkId))
            return;
        if (validatie == ValidatiePosture.Streng)
            throw new DomeinFout($"kunstwerk {kunstwerkId.Waarde} is onbekend of buiten gebruik");
    }
}
```

- [ ] **Step 3: In-memory fakes**

`monitoring/test/Monitoring.UnitTests/Support/Fakes.cs`:
```csharp
using Monitoring.Application;
using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Incidenten;
using Monitoring.Domain.Rapporten;
using Monitoring.Domain.Sessies;

namespace Monitoring.UnitTests.Support;

public sealed class InMemorySessieRepository : IMonitoringSessieRepository
{
    private readonly Dictionary<string, MonitoringSessie> _opslag = new();
    public Task BewaarAsync(MonitoringSessie sessie) { _opslag[sessie.Id.Waarde] = sessie; return Task.CompletedTask; }
    public Task<MonitoringSessie?> ZoekAsync(SessieId id) => Task.FromResult(_opslag.GetValueOrDefault(id.Waarde));
    public Task<IReadOnlyList<MonitoringSessie>> ZoekAlleAsync() => Task.FromResult<IReadOnlyList<MonitoringSessie>>(_opslag.Values.ToList());
    public Task<MonitoringSessie?> ZoekLopendeVoorKunstwerkAsync(KunstwerkReferentie kunstwerkId) =>
        Task.FromResult(_opslag.Values.FirstOrDefault(s => s.KunstwerkId == kunstwerkId && s.Status != MonitoringStatus.Afgerond));
}

public sealed class InMemoryMetingRepository : IMetingRepository
{
    public List<Meting> Metingen { get; } = new();
    public Task VoegToeAsync(Meting meting) { Metingen.Add(meting); return Task.CompletedTask; }
    public Task<IReadOnlyList<Meting>> ZoekAsync(KunstwerkReferentie kunstwerkId, SensorType? sensorType) =>
        Task.FromResult<IReadOnlyList<Meting>>(Metingen
            .Where(m => m.KunstwerkId == kunstwerkId && (sensorType is null || m.SensorData.SensorType == sensorType))
            .ToList());
    public Task<IReadOnlyList<Meting>> ZoekInPeriodeAsync(KunstwerkReferentie kunstwerkId, DateTime start, DateTime eind) =>
        Task.FromResult<IReadOnlyList<Meting>>(Metingen
            .Where(m => m.KunstwerkId == kunstwerkId && m.Tijdstip >= start && m.Tijdstip <= eind)
            .ToList());
}

public sealed class InMemoryIncidentRepository : IIncidentRepository
{
    private readonly Dictionary<string, Incident> _opslag = new();
    public Task BewaarAsync(Incident incident) { _opslag[incident.Id.Waarde] = incident; return Task.CompletedTask; }
    public Task<Incident?> ZoekAsync(IncidentId id) => Task.FromResult(_opslag.GetValueOrDefault(id.Waarde));
    public Task<IReadOnlyList<Incident>> ZoekAsync(IncidentStatus? status, KunstwerkReferentie? kunstwerkId) =>
        Task.FromResult<IReadOnlyList<Incident>>(_opslag.Values
            .Where(i => (status is null || i.Status == status) && (kunstwerkId is null || i.KunstwerkId == kunstwerkId))
            .ToList());
    public Task<IReadOnlyList<Incident>> ZoekInPeriodeAsync(KunstwerkReferentie kunstwerkId, DateTime start, DateTime eind) =>
        Task.FromResult<IReadOnlyList<Incident>>(_opslag.Values
            .Where(i => i.KunstwerkId == kunstwerkId && i.AangemaaktOp >= start && i.AangemaaktOp <= eind)
            .ToList());
}

public sealed class InMemoryRapportRepository : IRapportRepository
{
    private readonly Dictionary<string, MonitoringRapport> _opslag = new();
    public Task BewaarAsync(MonitoringRapport rapport) { _opslag[rapport.Id.Waarde] = rapport; return Task.CompletedTask; }
    public Task<MonitoringRapport?> ZoekAsync(RapportId id) => Task.FromResult(_opslag.GetValueOrDefault(id.Waarde));
    public Task<IReadOnlyList<MonitoringRapport>> ZoekAsync(KunstwerkReferentie? kunstwerkId) =>
        Task.FromResult<IReadOnlyList<MonitoringRapport>>(_opslag.Values
            .Where(r => kunstwerkId is null || r.KunstwerkId == kunstwerkId).ToList());
}

public sealed class FakeEventPublisher : IEventPublisher
{
    public List<IDomainEvent> Gepubliceerd { get; } = new();
    public Task PubliceerAsync(IReadOnlyList<IDomainEvent> events) { Gepubliceerd.AddRange(events); return Task.CompletedTask; }
    public IEnumerable<string> Types => Gepubliceerd.Select(e => e.EventType);
}

public sealed class FakeKunstwerkenReadModel : IKunstwerkenReadModel
{
    private readonly HashSet<string> _bekend;
    public FakeKunstwerkenReadModel(params string[] bekend) => _bekend = new HashSet<string>(bekend);
    public Task<bool> IsBekendEnInGebruikAsync(KunstwerkReferentie kunstwerkId) => Task.FromResult(_bekend.Contains(kunstwerkId.Waarde));
    public Task<IReadOnlyList<KunstwerkReferentie>> AlleInGebruikAsync() =>
        Task.FromResult<IReadOnlyList<KunstwerkReferentie>>(_bekend.Select(KunstwerkReferentie.Van).ToList());
}

public sealed class VasteIdGenerator : IIdGenerator
{
    private int _teller;
    private readonly string _prefix;
    public VasteIdGenerator(string prefix = "ID") => _prefix = prefix;
    public string Nieuw() => $"{_prefix}-{++_teller}";
}

public sealed class VasteKlok : IKlok
{
    private readonly DateTime _nu;
    public VasteKlok(DateTime nu) => _nu = nu;
    public DateTime Nu() => _nu;
}
```

- [ ] **Step 4: Write the failing tests**

`monitoring/test/Monitoring.UnitTests/Applicatie/SessieUseCasesTests.cs`:
```csharp
using Monitoring.Application;
using Monitoring.Application.Sessies;
using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Sessies;
using Monitoring.UnitTests.Support;
using Xunit;

namespace Monitoring.UnitTests.Applicatie;

public class SessieUseCasesTests
{
    private readonly InMemorySessieRepository _sessies = new();
    private readonly FakeEventPublisher _publisher = new();
    private readonly VasteKlok _klok = new(new DateTime(2026, 7, 1, 8, 0, 0, DateTimeKind.Utc));

    private StartMonitoringSessie Start(ValidatiePosture posture, params string[] bekend) =>
        new(_sessies, _publisher, new FakeKunstwerkenReadModel(bekend), new VasteIdGenerator("S"), _klok, posture);

    [Fact]
    public async Task Start_maakt_een_actieve_sessie_bij_soepele_validatie_ook_zonder_bekend_kunstwerk()
    {
        var id = await Start(ValidatiePosture.Soepel).UitvoerenAsync(new StartMonitoringSessieCommand("KW1"));
        var sessie = await _sessies.ZoekAsync(SessieId.Van(id));
        Assert.Equal(MonitoringStatus.Actief, sessie!.Status);
    }

    [Fact]
    public async Task Start_weigert_bij_streng_en_onbekend_kunstwerk()
    {
        await Assert.ThrowsAsync<DomeinFout>(() =>
            Start(ValidatiePosture.Streng).UitvoerenAsync(new StartMonitoringSessieCommand("KW1")));
    }

    [Fact]
    public async Task Start_slaagt_bij_streng_en_bekend_kunstwerk()
    {
        var id = await Start(ValidatiePosture.Streng, "KW1").UitvoerenAsync(new StartMonitoringSessieCommand("KW1"));
        Assert.NotNull(await _sessies.ZoekAsync(SessieId.Van(id)));
    }

    [Fact]
    public async Task Start_weigert_een_tweede_lopende_sessie_voor_hetzelfde_kunstwerk()
    {
        await Start(ValidatiePosture.Soepel).UitvoerenAsync(new StartMonitoringSessieCommand("KW1"));
        await Assert.ThrowsAsync<DomeinFout>(() =>
            Start(ValidatiePosture.Soepel).UitvoerenAsync(new StartMonitoringSessieCommand("KW1")));
    }

    [Fact]
    public async Task Pauzeer_hervat_en_rondaf_wijzigen_de_status()
    {
        var id = await Start(ValidatiePosture.Soepel).UitvoerenAsync(new StartMonitoringSessieCommand("KW1"));
        await new PauzeerMonitoringSessie(_sessies).UitvoerenAsync(id);
        Assert.Equal(MonitoringStatus.Gepauzeerd, (await _sessies.ZoekAsync(SessieId.Van(id)))!.Status);
        await new HervatMonitoringSessie(_sessies).UitvoerenAsync(id);
        Assert.Equal(MonitoringStatus.Actief, (await _sessies.ZoekAsync(SessieId.Van(id)))!.Status);
        await new RondMonitoringSessieAf(_sessies, _klok).UitvoerenAsync(id);
        Assert.Equal(MonitoringStatus.Afgerond, (await _sessies.ZoekAsync(SessieId.Van(id)))!.Status);
    }
}
```

- [ ] **Step 5: Run test to verify it fails**

Run: `dotnet test test/Monitoring.UnitTests --filter FullyQualifiedName~SessieUseCases`
Expected: FAIL — use cases ontbreken.

- [ ] **Step 6: `StartMonitoringSessie`**

`monitoring/src/Monitoring.Application/Sessies/StartMonitoringSessie.cs`:
```csharp
using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Sessies;

namespace Monitoring.Application.Sessies;

public sealed record StartMonitoringSessieCommand(string KunstwerkId);

public sealed class StartMonitoringSessie(
    IMonitoringSessieRepository sessies,
    IEventPublisher publisher,
    IKunstwerkenReadModel kunstwerken,
    IIdGenerator ids,
    IKlok klok,
    ValidatiePosture validatie)
{
    public async Task<string> UitvoerenAsync(StartMonitoringSessieCommand command)
    {
        var kunstwerkId = KunstwerkReferentie.Van(command.KunstwerkId);
        await Kunstwerkbewaking.BewaakAsync(kunstwerken, validatie, kunstwerkId);

        if (await sessies.ZoekLopendeVoorKunstwerkAsync(kunstwerkId) is not null)
            throw new DomeinFout("er loopt al een monitoringsessie voor dit kunstwerk");

        var sessie = MonitoringSessie.Start(SessieId.Van(ids.Nieuw()), kunstwerkId, klok.Nu());
        await sessies.BewaarAsync(sessie);
        await publisher.PubliceerAsync(sessie.TrekEventsLeeg());
        return sessie.Id.Waarde;
    }
}
```

- [ ] **Step 7: `PauzeerMonitoringSessie` / `HervatMonitoringSessie` / `RondMonitoringSessieAf`**

`monitoring/src/Monitoring.Application/Sessies/SessieLevenscyclus.cs`:
```csharp
using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Sessies;

namespace Monitoring.Application.Sessies;

public sealed class PauzeerMonitoringSessie(IMonitoringSessieRepository sessies)
{
    public async Task UitvoerenAsync(string sessieId)
    {
        var sessie = await Laad(sessies, sessieId);
        sessie.Pauzeer();
        await sessies.BewaarAsync(sessie);
    }

    internal static async Task<MonitoringSessie> Laad(IMonitoringSessieRepository sessies, string sessieId) =>
        await sessies.ZoekAsync(SessieId.Van(sessieId)) ?? throw new DomeinFout("sessie niet gevonden");
}

public sealed class HervatMonitoringSessie(IMonitoringSessieRepository sessies)
{
    public async Task UitvoerenAsync(string sessieId)
    {
        var sessie = await PauzeerMonitoringSessie.Laad(sessies, sessieId);
        sessie.Hervat();
        await sessies.BewaarAsync(sessie);
    }
}

public sealed class RondMonitoringSessieAf(IMonitoringSessieRepository sessies, IKlok klok)
{
    public async Task UitvoerenAsync(string sessieId)
    {
        var sessie = await PauzeerMonitoringSessie.Laad(sessies, sessieId);
        sessie.RondAf(klok.Nu());
        await sessies.BewaarAsync(sessie);
    }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `dotnet test test/Monitoring.UnitTests --filter FullyQualifiedName~SessieUseCases`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add monitoring/
git commit -m "feat(monitoring): application-ports, fakes en sessie-lifecycle-use-cases"
```

---

### Task 10: Application — `RegistreerMeting` (+ incident) + incident-use-cases

`RegistreerMeting` zoekt de lopende sessie, registreert de meting, laat de AnalyseService een afwijking detecteren en maakt bij een afwijking direct een incident aan; alle events gaan in één keer naar de publisher.

**Files:**
- Create: `monitoring/src/Monitoring.Application/Metingen/RegistreerMeting.cs`
- Create: `monitoring/src/Monitoring.Application/Incidenten/IncidentUseCases.cs`
- Test: `monitoring/test/Monitoring.UnitTests/Applicatie/RegistreerMetingTests.cs`
- Test: `monitoring/test/Monitoring.UnitTests/Applicatie/IncidentUseCasesTests.cs`

**Interfaces:**
- Produces: `RegistreerMeting` met `Task<RegistreerMetingResultaat> UitvoerenAsync(RegistreerMetingCommand)`; `record RegistreerMetingCommand(string KunstwerkId, string SensorType, double Waarde)`; `record RegistreerMetingResultaat(string MetingId, string? IncidentId)`.
- Produces: `NeemIncidentInBehandeling` (`Task UitvoerenAsync(string incidentId)`), `LosIncidentOp` (`Task UitvoerenAsync(string incidentId)`).

- [ ] **Step 1: Write the failing tests**

`monitoring/test/Monitoring.UnitTests/Applicatie/RegistreerMetingTests.cs`:
```csharp
using Monitoring.Application;
using Monitoring.Application.Metingen;
using Monitoring.Application.Sessies;
using Monitoring.Domain.Analyse;
using Monitoring.Domain.Gedeeld;
using Monitoring.UnitTests.Support;
using Xunit;

namespace Monitoring.UnitTests.Applicatie;

public class RegistreerMetingTests
{
    private readonly InMemorySessieRepository _sessies = new();
    private readonly InMemoryMetingRepository _metingen = new();
    private readonly InMemoryIncidentRepository _incidenten = new();
    private readonly FakeEventPublisher _publisher = new();
    private readonly VasteKlok _klok = new(new DateTime(2026, 7, 1, 9, 0, 0, DateTimeKind.Utc));

    private async Task StartSessieAsync()
    {
        var start = new StartMonitoringSessie(_sessies, _publisher, new FakeKunstwerkenReadModel("KW1"),
            new VasteIdGenerator("S"), _klok, ValidatiePosture.Soepel);
        await start.UitvoerenAsync(new StartMonitoringSessieCommand("KW1"));
        _publisher.Gepubliceerd.Clear();
    }

    private RegistreerMeting Maak() => new(_sessies, _metingen, _incidenten, _publisher,
        new FakeKunstwerkenReadModel("KW1"), new AnalyseService(), new VasteIdGenerator("M"), _klok, ValidatiePosture.Soepel);

    [Fact]
    public async Task Registreert_een_normale_meting_zonder_incident()
    {
        await StartSessieAsync();
        var resultaat = await Maak().UitvoerenAsync(new RegistreerMetingCommand("KW1", "Trilling", 3.0));
        Assert.Null(resultaat.IncidentId);
        Assert.Single(_metingen.Metingen);
        Assert.Equal(new[] { "monitoring.meting.geregistreerd" }, _publisher.Types);
    }

    [Fact]
    public async Task Maakt_een_incident_bij_een_afwijking_en_publiceert_beide_events()
    {
        await StartSessieAsync();
        var resultaat = await Maak().UitvoerenAsync(new RegistreerMetingCommand("KW1", "Trilling", 10.0)); // f = 2 -> Kritiek
        Assert.NotNull(resultaat.IncidentId);
        Assert.Equal(new[] { "monitoring.meting.geregistreerd", "monitoring.incident.aangemaakt" }, _publisher.Types);
    }

    [Fact]
    public async Task Weigert_meten_zonder_lopende_sessie()
    {
        await Assert.ThrowsAsync<DomeinFout>(() =>
            Maak().UitvoerenAsync(new RegistreerMetingCommand("KW1", "Trilling", 3.0)));
    }

    [Fact]
    public async Task Weigert_een_onbekend_sensortype()
    {
        await StartSessieAsync();
        await Assert.ThrowsAsync<DomeinFout>(() =>
            Maak().UitvoerenAsync(new RegistreerMetingCommand("KW1", "Geluid", 3.0)));
    }
}
```

`monitoring/test/Monitoring.UnitTests/Applicatie/IncidentUseCasesTests.cs`:
```csharp
using Monitoring.Application.Incidenten;
using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Incidenten;
using Monitoring.UnitTests.Support;
using Xunit;

namespace Monitoring.UnitTests.Applicatie;

public class IncidentUseCasesTests
{
    private readonly InMemoryIncidentRepository _incidenten = new();
    private readonly FakeEventPublisher _publisher = new();
    private readonly VasteKlok _klok = new(new DateTime(2026, 7, 3, 10, 0, 0, DateTimeKind.Utc));

    private async Task<string> GegevenNieuwIncidentAsync()
    {
        var incident = Incident.MaakAan(IncidentId.Van("I1"), KunstwerkReferentie.Van("KW1"),
            Afwijking.Van(SensorType.Trilling, 7.5, 5, Ernst.Hoog, new DateTime(2026, 7, 1, 9, 0, 0, DateTimeKind.Utc)));
        incident.TrekEventsLeeg();
        await _incidenten.BewaarAsync(incident);
        return "I1";
    }

    [Fact]
    public async Task Neemt_incident_in_behandeling()
    {
        var id = await GegevenNieuwIncidentAsync();
        await new NeemIncidentInBehandeling(_incidenten).UitvoerenAsync(id);
        Assert.Equal(IncidentStatus.InBehandeling, (await _incidenten.ZoekAsync(IncidentId.Van(id)))!.Status);
    }

    [Fact]
    public async Task Lost_incident_op_en_publiceert_het_event()
    {
        var id = await GegevenNieuwIncidentAsync();
        await new LosIncidentOp(_incidenten, _publisher, _klok).UitvoerenAsync(id);
        Assert.Equal(IncidentStatus.Opgelost, (await _incidenten.ZoekAsync(IncidentId.Van(id)))!.Status);
        Assert.Equal(new[] { "monitoring.incident.opgelost" }, _publisher.Types);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test test/Monitoring.UnitTests --filter "FullyQualifiedName~RegistreerMeting|FullyQualifiedName~IncidentUseCases"`
Expected: FAIL — use cases ontbreken.

- [ ] **Step 3: `RegistreerMeting`**

`monitoring/src/Monitoring.Application/Metingen/RegistreerMeting.cs`:
```csharp
using Monitoring.Domain.Analyse;
using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Incidenten;

namespace Monitoring.Application.Metingen;

public sealed record RegistreerMetingCommand(string KunstwerkId, string SensorType, double Waarde);

public sealed record RegistreerMetingResultaat(string MetingId, string? IncidentId);

public sealed class RegistreerMeting(
    IMonitoringSessieRepository sessies,
    IMetingRepository metingen,
    IIncidentRepository incidenten,
    IEventPublisher publisher,
    IKunstwerkenReadModel kunstwerken,
    AnalyseService analyse,
    IIdGenerator ids,
    IKlok klok,
    ValidatiePosture validatie)
{
    public async Task<RegistreerMetingResultaat> UitvoerenAsync(RegistreerMetingCommand command)
    {
        if (!Enum.TryParse<SensorType>(command.SensorType, ignoreCase: false, out var sensorType))
            throw new DomeinFout($"onbekend sensortype: {command.SensorType}");

        var kunstwerkId = KunstwerkReferentie.Van(command.KunstwerkId);
        await Kunstwerkbewaking.BewaakAsync(kunstwerken, validatie, kunstwerkId);

        var sessie = await sessies.ZoekLopendeVoorKunstwerkAsync(kunstwerkId)
            ?? throw new DomeinFout("geen lopende monitoringsessie voor dit kunstwerk");

        var nu = klok.Nu();
        var sensorData = SensorData.Van(sensorType, command.Waarde);
        var meting = sessie.RegistreerMeting(MetingId.Van(ids.Nieuw()), sensorData, nu);
        await sessies.BewaarAsync(sessie);
        await metingen.VoegToeAsync(meting);

        var teVerzenden = new List<IDomainEvent>(sessie.TrekEventsLeeg());

        string? incidentId = null;
        var afwijking = analyse.Analyseer(sensorData, nu);
        if (afwijking is not null)
        {
            var incident = Incident.MaakAan(IncidentId.Van(ids.Nieuw()), kunstwerkId, afwijking);
            await incidenten.BewaarAsync(incident);
            teVerzenden.AddRange(incident.TrekEventsLeeg());
            incidentId = incident.Id.Waarde;
        }

        await publisher.PubliceerAsync(teVerzenden);
        return new RegistreerMetingResultaat(meting.Id.Waarde, incidentId);
    }
}
```

- [ ] **Step 4: `NeemIncidentInBehandeling` + `LosIncidentOp`**

`monitoring/src/Monitoring.Application/Incidenten/IncidentUseCases.cs`:
```csharp
using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Incidenten;

namespace Monitoring.Application.Incidenten;

public sealed class NeemIncidentInBehandeling(IIncidentRepository incidenten)
{
    public async Task UitvoerenAsync(string incidentId)
    {
        var incident = await incidenten.ZoekAsync(IncidentId.Van(incidentId))
            ?? throw new DomeinFout("incident niet gevonden");
        incident.NeemInBehandeling();
        await incidenten.BewaarAsync(incident);
    }
}

public sealed class LosIncidentOp(IIncidentRepository incidenten, IEventPublisher publisher, IKlok klok)
{
    public async Task UitvoerenAsync(string incidentId)
    {
        var incident = await incidenten.ZoekAsync(IncidentId.Van(incidentId))
            ?? throw new DomeinFout("incident niet gevonden");
        incident.LosOp(klok.Nu());
        await incidenten.BewaarAsync(incident);
        await publisher.PubliceerAsync(incident.TrekEventsLeeg());
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `dotnet test test/Monitoring.UnitTests --filter "FullyQualifiedName~RegistreerMeting|FullyQualifiedName~IncidentUseCases"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add monitoring/
git commit -m "feat(monitoring): RegistreerMeting met incidentdetectie en incident-use-cases"
```

---

### Task 11: Application — `StelRapportOp`

On-demand per-kunstwerk-rapport dat de metingen en incidenten in een periode samenvat en `monitoring.rapport.opgesteld` publiceert.

**Files:**
- Create: `monitoring/src/Monitoring.Application/Rapporten/StelRapportOp.cs`
- Test: `monitoring/test/Monitoring.UnitTests/Applicatie/StelRapportOpTests.cs`

**Interfaces:**
- Produces: `StelRapportOp` met `Task<string> UitvoerenAsync(StelRapportOpCommand)`; `record StelRapportOpCommand(string KunstwerkId, DateTime PeriodeStart, DateTime PeriodeEind)`.

- [ ] **Step 1: Write the failing test**

`monitoring/test/Monitoring.UnitTests/Applicatie/StelRapportOpTests.cs`:
```csharp
using Monitoring.Application.Rapporten;
using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Sessies;
using Monitoring.UnitTests.Support;
using Xunit;

namespace Monitoring.UnitTests.Applicatie;

public class StelRapportOpTests
{
    [Fact]
    public async Task Stelt_een_rapport_op_over_de_metingen_in_de_periode_en_publiceert_het_event()
    {
        var metingen = new InMemoryMetingRepository();
        var incidenten = new InMemoryIncidentRepository();
        var rapporten = new InMemoryRapportRepository();
        var publisher = new FakeEventPublisher();
        var klok = new VasteKlok(new DateTime(2026, 7, 2, 12, 0, 0, DateTimeKind.Utc));

        await metingen.VoegToeAsync(new Meting(MetingId.Van("M1"), SessieId.Van("S1"), KunstwerkReferentie.Van("KW1"),
            SensorData.Van(SensorType.Trilling, 4), new DateTime(2026, 7, 1, 9, 0, 0, DateTimeKind.Utc)));

        var useCase = new StelRapportOp(metingen, incidenten, rapporten, publisher, new VasteIdGenerator("R"), klok);
        var id = await useCase.UitvoerenAsync(new StelRapportOpCommand("KW1",
            new DateTime(2026, 7, 1, 0, 0, 0, DateTimeKind.Utc), new DateTime(2026, 7, 2, 0, 0, 0, DateTimeKind.Utc)));

        Assert.NotNull(await rapporten.ZoekAsync(RapportId.Van(id)));
        Assert.Equal(new[] { "monitoring.rapport.opgesteld" }, publisher.Types);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test test/Monitoring.UnitTests --filter FullyQualifiedName~StelRapportOp`
Expected: FAIL — use case ontbreekt.

- [ ] **Step 3: `StelRapportOp`**

`monitoring/src/Monitoring.Application/Rapporten/StelRapportOp.cs`:
```csharp
using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Rapporten;

namespace Monitoring.Application.Rapporten;

public sealed record StelRapportOpCommand(string KunstwerkId, DateTime PeriodeStart, DateTime PeriodeEind);

public sealed class StelRapportOp(
    IMetingRepository metingen,
    IIncidentRepository incidenten,
    IRapportRepository rapporten,
    IEventPublisher publisher,
    IIdGenerator ids,
    IKlok klok)
{
    public async Task<string> UitvoerenAsync(StelRapportOpCommand command)
    {
        var kunstwerkId = KunstwerkReferentie.Van(command.KunstwerkId);
        var m = await metingen.ZoekInPeriodeAsync(kunstwerkId, command.PeriodeStart, command.PeriodeEind);
        var i = await incidenten.ZoekInPeriodeAsync(kunstwerkId, command.PeriodeStart, command.PeriodeEind);

        var rapport = MonitoringRapport.StelOp(RapportId.Van(ids.Nieuw()), kunstwerkId,
            command.PeriodeStart, command.PeriodeEind, m, i, klok.Nu());
        await rapporten.BewaarAsync(rapport);
        await publisher.PubliceerAsync(rapport.TrekEventsLeeg());
        return rapport.Id.Waarde;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test test/Monitoring.UnitTests --filter FullyQualifiedName~StelRapportOp`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add monitoring/
git commit -m "feat(monitoring): StelRapportOp-use-case (monitoring.rapport.opgesteld)"
```

---

### Task 12: Application + Domein — netwerkrapportage naar Beheer (Fase 2)

Nieuw event `monitoring.netwerkrapportage.opgesteld`: een netwerkbrede samenvatting per kunstwerk voor Beheer (customer). Voegt het event-record + een klein write-once domeinobject + de use case toe.

**Files:**
- Modify: `monitoring/src/Monitoring.Domain/Gedeeld/DomainEvents.cs` (voeg event-record toe)
- Create: `monitoring/src/Monitoring.Domain/Rapporten/Netwerkrapportage.cs`
- Create: `monitoring/src/Monitoring.Application/Rapporten/StelNetwerkrapportageOp.cs`
- Test: `monitoring/test/Monitoring.UnitTests/Applicatie/StelNetwerkrapportageOpTests.cs`

**Interfaces:**
- Produces: `record NetwerkrapportageOpgesteld(string PeriodeStart, string PeriodeEind, string OpgesteldOp, object Kunstwerken) : IDomainEvent` (`EventType = "monitoring.netwerkrapportage.opgesteld"`).
- Produces: `record KunstwerkSamenvatting(string KunstwerkId, int AantalMetingen, int AantalIncidenten, string? ZwaarsteErnst)`; `sealed class Netwerkrapportage : AggregateRoot` met `static StelOp(RapportId, DateTime periodeStart, DateTime periodeEind, IReadOnlyList<KunstwerkSamenvatting>, DateTime opgesteldOp)`.
- Produces: `StelNetwerkrapportageOp` met `Task<string> UitvoerenAsync(StelNetwerkrapportageOpCommand)`; `record StelNetwerkrapportageOpCommand(DateTime PeriodeStart, DateTime PeriodeEind)`.

- [ ] **Step 1: Write the failing test**

`monitoring/test/Monitoring.UnitTests/Applicatie/StelNetwerkrapportageOpTests.cs`:
```csharp
using Monitoring.Application.Rapporten;
using Monitoring.Domain.Gedeeld;
using Monitoring.UnitTests.Support;
using Xunit;

namespace Monitoring.UnitTests.Applicatie;

public class StelNetwerkrapportageOpTests
{
    [Fact]
    public async Task Vat_per_kunstwerk_samen_en_publiceert_het_netwerkrapportage_event()
    {
        var metingen = new InMemoryMetingRepository();
        var incidenten = new InMemoryIncidentRepository();
        var publisher = new FakeEventPublisher();
        var klok = new VasteKlok(new DateTime(2026, 7, 2, 12, 0, 0, DateTimeKind.Utc));
        var kunstwerken = new FakeKunstwerkenReadModel("KW1", "KW2");

        await metingen.VoegToeAsync(new Domain.Sessies.Meting(MetingId.Van("M1"), SessieId.Van("S1"),
            KunstwerkReferentie.Van("KW1"), SensorData.Van(SensorType.Trilling, 4),
            new DateTime(2026, 7, 1, 9, 0, 0, DateTimeKind.Utc)));

        var useCase = new StelNetwerkrapportageOp(kunstwerken, metingen, incidenten, publisher, new VasteIdGenerator("N"), klok);
        var id = await useCase.UitvoerenAsync(new StelNetwerkrapportageOpCommand(
            new DateTime(2026, 7, 1, 0, 0, 0, DateTimeKind.Utc), new DateTime(2026, 7, 2, 0, 0, 0, DateTimeKind.Utc)));

        Assert.NotNull(id);
        Assert.Equal(new[] { "monitoring.netwerkrapportage.opgesteld" }, publisher.Types);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test test/Monitoring.UnitTests --filter FullyQualifiedName~StelNetwerkrapportageOp`
Expected: FAIL — types ontbreken.

- [ ] **Step 3: Event-record toevoegen**

Voeg onderaan `monitoring/src/Monitoring.Domain/Gedeeld/DomainEvents.cs` toe:
```csharp
public sealed record NetwerkrapportageOpgesteld(string PeriodeStart, string PeriodeEind, string OpgesteldOp, object Kunstwerken) : IDomainEvent
{
    public string EventType => "monitoring.netwerkrapportage.opgesteld";
    public IReadOnlyDictionary<string, object?> Data => new Dictionary<string, object?>
    {
        ["periode"] = new Dictionary<string, object?> { ["start"] = PeriodeStart, ["eind"] = PeriodeEind },
        ["opgesteldOp"] = OpgesteldOp,
        ["kunstwerken"] = Kunstwerken,
    };
}
```

- [ ] **Step 4: `Netwerkrapportage`-domeinobject**

`monitoring/src/Monitoring.Domain/Rapporten/Netwerkrapportage.cs`:
```csharp
using Monitoring.Domain.Gedeeld;

namespace Monitoring.Domain.Rapporten;

public sealed record KunstwerkSamenvatting(string KunstwerkId, int AantalMetingen, int AantalIncidenten, string? ZwaarsteErnst);

public sealed class Netwerkrapportage : AggregateRoot
{
    public RapportId Id { get; }
    public DateTime PeriodeStart { get; }
    public DateTime PeriodeEind { get; }
    public IReadOnlyList<KunstwerkSamenvatting> Kunstwerken { get; }
    public DateTime OpgesteldOp { get; }

    private Netwerkrapportage(RapportId id, DateTime periodeStart, DateTime periodeEind,
        IReadOnlyList<KunstwerkSamenvatting> kunstwerken, DateTime opgesteldOp)
    {
        Id = id;
        PeriodeStart = periodeStart;
        PeriodeEind = periodeEind;
        Kunstwerken = kunstwerken;
        OpgesteldOp = opgesteldOp;
    }

    public static Netwerkrapportage StelOp(RapportId id, DateTime periodeStart, DateTime periodeEind,
        IReadOnlyList<KunstwerkSamenvatting> kunstwerken, DateTime opgesteldOp)
    {
        var rapportage = new Netwerkrapportage(id, periodeStart, periodeEind, kunstwerken, opgesteldOp);
        rapportage.RegistreerEvent(new NetwerkrapportageOpgesteld(
            periodeStart.NaarIso(), periodeEind.NaarIso(), opgesteldOp.NaarIso(), kunstwerken));
        return rapportage;
    }
}
```

- [ ] **Step 5: `StelNetwerkrapportageOp`-use-case**

`monitoring/src/Monitoring.Application/Rapporten/StelNetwerkrapportageOp.cs`:
```csharp
using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Rapporten;

namespace Monitoring.Application.Rapporten;

public sealed record StelNetwerkrapportageOpCommand(DateTime PeriodeStart, DateTime PeriodeEind);

public sealed class StelNetwerkrapportageOp(
    IKunstwerkenReadModel kunstwerken,
    IMetingRepository metingen,
    IIncidentRepository incidenten,
    IEventPublisher publisher,
    IIdGenerator ids,
    IKlok klok)
{
    public async Task<string> UitvoerenAsync(StelNetwerkrapportageOpCommand command)
    {
        var samenvattingen = new List<KunstwerkSamenvatting>();
        foreach (var kunstwerkId in await kunstwerken.AlleInGebruikAsync())
        {
            var m = await metingen.ZoekInPeriodeAsync(kunstwerkId, command.PeriodeStart, command.PeriodeEind);
            var i = await incidenten.ZoekInPeriodeAsync(kunstwerkId, command.PeriodeStart, command.PeriodeEind);
            var zwaarste = i.Count == 0 ? null : i.OrderByDescending(x => x.Ernst.Orde()).First().Ernst.ToString();
            samenvattingen.Add(new KunstwerkSamenvatting(kunstwerkId.Waarde, m.Count, i.Count, zwaarste));
        }

        var rapportage = Netwerkrapportage.StelOp(RapportId.Van(ids.Nieuw()),
            command.PeriodeStart, command.PeriodeEind, samenvattingen, klok.Nu());
        await publisher.PubliceerAsync(rapportage.TrekEventsLeeg());
        return rapportage.Id.Waarde;
    }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `dotnet test test/Monitoring.UnitTests --filter FullyQualifiedName~StelNetwerkrapportageOp`
Expected: PASS. Draai daarna de hele unit-suite: `dotnet test test/Monitoring.UnitTests` → alles groen.

- [ ] **Step 7: Commit**

```bash
git add monitoring/
git commit -m "feat(monitoring): netwerkrapportage-event en StelNetwerkrapportageOp (Fase 2)"
```

---

### Task 13: Infrastructure — domein-rows + pure mappers + `Herstel` + JSON-opties

Persistence-row-POCO's voor de vier domeinaggregates en **pure mappers** (row ↔ domein), zodat de mapping los van EF getest wordt. Voegt `MonitoringRapport.Herstel` toe en de gedeelde `System.Text.Json`-opties.

**Files:**
- Create: `monitoring/src/Monitoring.Infrastructure/Serialisatie.cs`
- Create: `monitoring/src/Monitoring.Infrastructure/Persistence/Rows/MonitoringSessieRow.cs`
- Create: `monitoring/src/Monitoring.Infrastructure/Persistence/Rows/MetingRow.cs`
- Create: `monitoring/src/Monitoring.Infrastructure/Persistence/Rows/IncidentRow.cs`
- Create: `monitoring/src/Monitoring.Infrastructure/Persistence/Rows/MonitoringRapportRow.cs`
- Create: `monitoring/src/Monitoring.Infrastructure/Persistence/Mappers.cs`
- Modify: `monitoring/src/Monitoring.Domain/Rapporten/MonitoringRapport.cs` (voeg `Herstel` toe)
- Test: `monitoring/test/Monitoring.UnitTests/Persistence/MappersTests.cs`

**Interfaces:**
- Produces: `static JsonSerializerOptions Serialisatie.Opties` (Web-defaults: camelCase + case-insensitive).
- Produces: row-POCO's `MonitoringSessieRow`, `MetingRow`, `IncidentRow`, `MonitoringRapportRow`.
- Produces: `static class SessieMapper/MetingMapper/IncidentMapper/RapportMapper` elk met `NaarRow(domein)` en `NaarDomein(row)`.
- Produces: `static MonitoringRapport MonitoringRapport.Herstel(RapportId, KunstwerkReferentie, DateTime, DateTime, IncidentId?, RapportResultaten, DateTime)`.

- [ ] **Step 1: JSON-opties**

`monitoring/src/Monitoring.Infrastructure/Serialisatie.cs`:
```csharp
using System.Text.Json;

namespace Monitoring.Infrastructure;

public static class Serialisatie
{
    // Web-defaults = camelCase property policy + case-insensitive lezen. Byte-compatibel met de andere services.
    public static readonly JsonSerializerOptions Opties = new(JsonSerializerDefaults.Web);
}
```

- [ ] **Step 2: Row-POCO's**

`monitoring/src/Monitoring.Infrastructure/Persistence/Rows/MonitoringSessieRow.cs`:
```csharp
namespace Monitoring.Infrastructure.Persistence.Rows;

public class MonitoringSessieRow
{
    public string Id { get; set; } = "";
    public string KunstwerkId { get; set; } = "";
    public string Status { get; set; } = "";
    public DateTime GestartOp { get; set; }
    public DateTime? BeeindigdOp { get; set; }
    public int AantalMetingen { get; set; }
}
```

`monitoring/src/Monitoring.Infrastructure/Persistence/Rows/MetingRow.cs`:
```csharp
namespace Monitoring.Infrastructure.Persistence.Rows;

public class MetingRow
{
    public string Id { get; set; } = "";
    public string SessieId { get; set; } = "";
    public string KunstwerkId { get; set; } = "";
    public string SensorType { get; set; } = "";
    public double Waarde { get; set; }
    public string Eenheid { get; set; } = "";
    public DateTime Tijdstip { get; set; }
}
```

`monitoring/src/Monitoring.Infrastructure/Persistence/Rows/IncidentRow.cs`:
```csharp
namespace Monitoring.Infrastructure.Persistence.Rows;

public class IncidentRow
{
    public string Id { get; set; } = "";
    public string KunstwerkId { get; set; } = "";
    public string SensorType { get; set; } = "";
    public double GemetenWaarde { get; set; }
    public double Drempelwaarde { get; set; }
    public string Ernst { get; set; } = "";
    public string Omschrijving { get; set; } = "";
    public string Vervolgactie { get; set; } = "";
    public string Status { get; set; } = "";
    public DateTime AangemaaktOp { get; set; }
    public DateTime? OpgelostOp { get; set; }
}
```

`monitoring/src/Monitoring.Infrastructure/Persistence/Rows/MonitoringRapportRow.cs`:
```csharp
namespace Monitoring.Infrastructure.Persistence.Rows;

public class MonitoringRapportRow
{
    public string Id { get; set; } = "";
    public string KunstwerkId { get; set; } = "";
    public DateTime PeriodeStart { get; set; }
    public DateTime PeriodeEind { get; set; }
    public string? ZwaarsteOpenIncidentId { get; set; }
    public string Resultaten { get; set; } = "";  // jsonb: geserialiseerde RapportResultaten
    public DateTime OpgesteldOp { get; set; }
}
```

- [ ] **Step 3: `MonitoringRapport.Herstel` toevoegen**

Voeg in `monitoring/src/Monitoring.Domain/Rapporten/MonitoringRapport.cs` een `Herstel`-factory toe, direct na de `StelOp`-methode (binnen de klasse):
```csharp
    public static MonitoringRapport Herstel(RapportId id, KunstwerkReferentie kunstwerkId, DateTime periodeStart,
        DateTime periodeEind, IncidentId? zwaarsteOpenIncident, RapportResultaten resultaten, DateTime opgesteldOp) =>
        new(id, kunstwerkId, periodeStart, periodeEind, zwaarsteOpenIncident, resultaten, opgesteldOp);
```

- [ ] **Step 4: Write the failing test**

`monitoring/test/Monitoring.UnitTests/Persistence/MappersTests.cs`:
```csharp
using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Incidenten;
using Monitoring.Domain.Rapporten;
using Monitoring.Domain.Sessies;
using Monitoring.Infrastructure.Persistence;
using Xunit;

namespace Monitoring.UnitTests.Persistence;

public class MappersTests
{
    private static readonly DateTime T = new(2026, 7, 1, 9, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Sessie_roundtrip_behoudt_de_kernvelden()
    {
        var sessie = MonitoringSessie.Herstel(SessieId.Van("S1"), KunstwerkReferentie.Van("KW1"),
            MonitoringStatus.Gepauzeerd, T, null, 3);
        var terug = SessieMapper.NaarDomein(SessieMapper.NaarRow(sessie));
        Assert.Equal("S1", terug.Id.Waarde);
        Assert.Equal(MonitoringStatus.Gepauzeerd, terug.Status);
        Assert.Equal(3, terug.AantalMetingen);
    }

    [Fact]
    public void Meting_roundtrip_behoudt_de_sensordata()
    {
        var meting = new Meting(MetingId.Van("M1"), SessieId.Van("S1"), KunstwerkReferentie.Van("KW1"),
            SensorData.Van(SensorType.Belasting, 120), T);
        var terug = MetingMapper.NaarDomein(MetingMapper.NaarRow(meting));
        Assert.Equal(SensorType.Belasting, terug.SensorData.SensorType);
        Assert.Equal(120, terug.SensorData.Waarde);
        Assert.Equal("kN", terug.SensorData.Eenheid);
    }

    [Fact]
    public void Incident_roundtrip_behoudt_status_en_ernst()
    {
        var incident = Incident.MaakAan(IncidentId.Van("I1"), KunstwerkReferentie.Van("KW1"),
            Afwijking.Van(SensorType.Trilling, 7.5, 5, Ernst.Hoog, T));
        var terug = IncidentMapper.NaarDomein(IncidentMapper.NaarRow(incident));
        Assert.Equal(Ernst.Hoog, terug.Ernst);
        Assert.Equal(Vervolgactie.Onderhoud, terug.Vervolgactie);
        Assert.Equal(IncidentStatus.Nieuw, terug.Status);
    }

    [Fact]
    public void Rapport_roundtrip_behoudt_resultaten_via_jsonb()
    {
        var rapport = MonitoringRapport.StelOp(RapportId.Van("R1"), KunstwerkReferentie.Van("KW1"),
            T, T.AddDays(1),
            new List<Meting> { new(MetingId.Van("M1"), SessieId.Van("S1"), KunstwerkReferentie.Van("KW1"), SensorData.Van(SensorType.Trilling, 4), T) },
            new List<Incident>(), T.AddDays(1));
        var terug = RapportMapper.NaarDomein(RapportMapper.NaarRow(rapport));
        Assert.Single(terug.Resultaten.PerSensor);
        Assert.Equal("Trilling", terug.Resultaten.PerSensor[0].SensorType);
        Assert.Equal(4, terug.Resultaten.PerSensor[0].Gemiddelde);
    }
}
```

- [ ] **Step 5: Run test to verify it fails**

Run: `dotnet test test/Monitoring.UnitTests --filter FullyQualifiedName~Mappers`
Expected: FAIL — mappers ontbreken.

- [ ] **Step 6: Mappers**

`monitoring/src/Monitoring.Infrastructure/Persistence/Mappers.cs`:
```csharp
using System.Text.Json;
using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Incidenten;
using Monitoring.Domain.Rapporten;
using Monitoring.Domain.Sessies;
using Monitoring.Infrastructure.Persistence.Rows;

namespace Monitoring.Infrastructure.Persistence;

public static class SessieMapper
{
    public static MonitoringSessieRow NaarRow(MonitoringSessie s) => new()
    {
        Id = s.Id.Waarde,
        KunstwerkId = s.KunstwerkId.Waarde,
        Status = s.Status.ToString(),
        GestartOp = s.GestartOp,
        BeeindigdOp = s.BeeindigdOp,
        AantalMetingen = s.AantalMetingen,
    };

    public static MonitoringSessie NaarDomein(MonitoringSessieRow r) => MonitoringSessie.Herstel(
        SessieId.Van(r.Id), KunstwerkReferentie.Van(r.KunstwerkId),
        Enum.Parse<MonitoringStatus>(r.Status), r.GestartOp, r.BeeindigdOp, r.AantalMetingen);
}

public static class MetingMapper
{
    public static MetingRow NaarRow(Meting m) => new()
    {
        Id = m.Id.Waarde,
        SessieId = m.SessieId.Waarde,
        KunstwerkId = m.KunstwerkId.Waarde,
        SensorType = m.SensorData.SensorType.ToString(),
        Waarde = m.SensorData.Waarde,
        Eenheid = m.SensorData.Eenheid,
        Tijdstip = m.Tijdstip,
    };

    public static Meting NaarDomein(MetingRow r) => new(
        MetingId.Van(r.Id), SessieId.Van(r.SessieId), KunstwerkReferentie.Van(r.KunstwerkId),
        SensorData.Van(Enum.Parse<SensorType>(r.SensorType), r.Waarde), r.Tijdstip);
}

public static class IncidentMapper
{
    public static IncidentRow NaarRow(Incident i) => new()
    {
        Id = i.Id.Waarde,
        KunstwerkId = i.KunstwerkId.Waarde,
        SensorType = i.SensorType.ToString(),
        GemetenWaarde = i.GemetenWaarde,
        Drempelwaarde = i.Drempelwaarde,
        Ernst = i.Ernst.ToString(),
        Omschrijving = i.Omschrijving,
        Vervolgactie = i.Vervolgactie.ToString(),
        Status = i.Status.ToString(),
        AangemaaktOp = i.AangemaaktOp,
        OpgelostOp = i.OpgelostOp,
    };

    public static Incident NaarDomein(IncidentRow r) => Incident.Herstel(
        IncidentId.Van(r.Id), KunstwerkReferentie.Van(r.KunstwerkId), Enum.Parse<SensorType>(r.SensorType),
        r.GemetenWaarde, r.Drempelwaarde, Enum.Parse<Ernst>(r.Ernst), r.Omschrijving,
        Enum.Parse<Vervolgactie>(r.Vervolgactie), Enum.Parse<IncidentStatus>(r.Status), r.AangemaaktOp, r.OpgelostOp);
}

public static class RapportMapper
{
    public static MonitoringRapportRow NaarRow(MonitoringRapport r) => new()
    {
        Id = r.Id.Waarde,
        KunstwerkId = r.KunstwerkId.Waarde,
        PeriodeStart = r.PeriodeStart,
        PeriodeEind = r.PeriodeEind,
        ZwaarsteOpenIncidentId = r.ZwaarsteOpenIncident?.Waarde,
        Resultaten = JsonSerializer.Serialize(r.Resultaten, Serialisatie.Opties),
        OpgesteldOp = r.OpgesteldOp,
    };

    public static MonitoringRapport NaarDomein(MonitoringRapportRow r) => MonitoringRapport.Herstel(
        RapportId.Van(r.Id), KunstwerkReferentie.Van(r.KunstwerkId), r.PeriodeStart, r.PeriodeEind,
        r.ZwaarsteOpenIncidentId is null ? null : IncidentId.Van(r.ZwaarsteOpenIncidentId),
        JsonSerializer.Deserialize<RapportResultaten>(r.Resultaten, Serialisatie.Opties)!, r.OpgesteldOp);
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `dotnet test test/Monitoring.UnitTests --filter FullyQualifiedName~Mappers`
Expected: PASS (4 tests).

- [ ] **Step 8: Commit**

```bash
git add monitoring/
git commit -m "feat(monitoring): persistence-rows en pure row<->domein-mappers"
```

---

### Task 14: Infrastructure — EF-repositories, read-model, klok/id + domein-migratie

De EF-implementaties van de vier repositories + het kunstwerken-read-model, plus `SysteemKlok`/`UuidIdGenerator`. Breidt de `DbContext` uit met de domeintabellen en genereert de tweede migratie. Round-trips tegen een echte DB worden in Task 20 (Testcontainers) getest; hier is de gate: build groen + migratie schoon toegepast.

**Files:**
- Modify: `monitoring/src/Monitoring.Infrastructure/Persistence/MonitoringDbContext.cs` (domein-DbSets + config)
- Create: `monitoring/src/Monitoring.Infrastructure/Persistence/EfRepositories.cs`
- Create: `monitoring/src/Monitoring.Infrastructure/Persistence/EfKunstwerkenReadModel.cs`
- Create: `monitoring/src/Monitoring.Infrastructure/SysteemKlok.cs`
- Create: `monitoring/src/Monitoring.Infrastructure/UuidIdGenerator.cs`

**Interfaces:**
- Produces: `EfMonitoringSessieRepository`, `EfMetingRepository`, `EfIncidentRepository`, `EfRapportRepository` (impl. van de ports uit Task 9).
- Produces: `EfKunstwerkenReadModel : IKunstwerkenReadModel`.
- Produces: `SysteemKlok : IKlok` (`DateTime.UtcNow`), `UuidIdGenerator : IIdGenerator` (`Guid.NewGuid()`).

- [ ] **Step 1: `MonitoringDbContext` uitbreiden**

Vervang `monitoring/src/Monitoring.Infrastructure/Persistence/MonitoringDbContext.cs`:
```csharp
using Microsoft.EntityFrameworkCore;
using Monitoring.Infrastructure.Persistence.Rows;

namespace Monitoring.Infrastructure.Persistence;

public class MonitoringDbContext(DbContextOptions<MonitoringDbContext> options) : DbContext(options)
{
    public DbSet<BekendKunstwerkRow> BekendeKunstwerken => Set<BekendKunstwerkRow>();
    public DbSet<VerwerktEventRow> VerwerkteEvents => Set<VerwerktEventRow>();
    public DbSet<OutboxMessageRow> Outbox => Set<OutboxMessageRow>();
    public DbSet<MonitoringSessieRow> Sessies => Set<MonitoringSessieRow>();
    public DbSet<MetingRow> Metingen => Set<MetingRow>();
    public DbSet<IncidentRow> Incidenten => Set<IncidentRow>();
    public DbSet<MonitoringRapportRow> Rapporten => Set<MonitoringRapportRow>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<BekendKunstwerkRow>(e => { e.ToTable("bekend_kunstwerk"); e.HasKey(x => x.KunstwerkId); });
        b.Entity<VerwerktEventRow>(e => { e.ToTable("verwerkt_event"); e.HasKey(x => x.EventId); });
        b.Entity<OutboxMessageRow>(e =>
        {
            e.ToTable("outbox_message");
            e.HasKey(x => x.Id);
            e.Property(x => x.Payload).HasColumnType("jsonb");
            e.HasIndex(x => new { x.Gepubliceerd, x.AangemaaktOp });
        });

        b.Entity<MonitoringSessieRow>(e =>
        {
            e.ToTable("monitoring_sessie");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.KunstwerkId);
        });
        b.Entity<MetingRow>(e =>
        {
            e.ToTable("meting");
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.KunstwerkId, x.Tijdstip });
        });
        b.Entity<IncidentRow>(e =>
        {
            e.ToTable("incident");
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.KunstwerkId, x.Status });
        });
        b.Entity<MonitoringRapportRow>(e =>
        {
            e.ToTable("monitoring_rapport");
            e.HasKey(x => x.Id);
            e.Property(x => x.Resultaten).HasColumnType("jsonb");
        });
    }
}
```

- [ ] **Step 2: EF-repositories**

`monitoring/src/Monitoring.Infrastructure/Persistence/EfRepositories.cs`:
```csharp
using Microsoft.EntityFrameworkCore;
using Monitoring.Application;
using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Incidenten;
using Monitoring.Domain.Rapporten;
using Monitoring.Domain.Sessies;
using Monitoring.Infrastructure.Persistence.Rows;

namespace Monitoring.Infrastructure.Persistence;

public sealed class EfMonitoringSessieRepository(MonitoringDbContext db) : IMonitoringSessieRepository
{
    public async Task BewaarAsync(MonitoringSessie sessie)
    {
        var row = SessieMapper.NaarRow(sessie);
        var bestaand = await db.Sessies.FindAsync(row.Id);
        if (bestaand is null) db.Sessies.Add(row);
        else db.Entry(bestaand).CurrentValues.SetValues(row);
        await db.SaveChangesAsync();
    }

    public async Task<MonitoringSessie?> ZoekAsync(SessieId id)
    {
        var row = await db.Sessies.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id.Waarde);
        return row is null ? null : SessieMapper.NaarDomein(row);
    }

    public async Task<IReadOnlyList<MonitoringSessie>> ZoekAlleAsync()
    {
        var rows = await db.Sessies.AsNoTracking().ToListAsync();
        return rows.Select(SessieMapper.NaarDomein).ToList();
    }

    public async Task<MonitoringSessie?> ZoekLopendeVoorKunstwerkAsync(KunstwerkReferentie kunstwerkId)
    {
        var row = await db.Sessies.AsNoTracking()
            .FirstOrDefaultAsync(x => x.KunstwerkId == kunstwerkId.Waarde && x.Status != "Afgerond");
        return row is null ? null : SessieMapper.NaarDomein(row);
    }
}

public sealed class EfMetingRepository(MonitoringDbContext db) : IMetingRepository
{
    public async Task VoegToeAsync(Meting meting)
    {
        db.Metingen.Add(MetingMapper.NaarRow(meting));
        await db.SaveChangesAsync();
    }

    public async Task<IReadOnlyList<Meting>> ZoekAsync(KunstwerkReferentie kunstwerkId, SensorType? sensorType)
    {
        var q = db.Metingen.AsNoTracking().Where(m => m.KunstwerkId == kunstwerkId.Waarde);
        if (sensorType is not null)
        {
            var st = sensorType.Value.ToString();
            q = q.Where(m => m.SensorType == st);
        }
        var rows = await q.OrderBy(m => m.Tijdstip).ToListAsync();
        return rows.Select(MetingMapper.NaarDomein).ToList();
    }

    public async Task<IReadOnlyList<Meting>> ZoekInPeriodeAsync(KunstwerkReferentie kunstwerkId, DateTime start, DateTime eind)
    {
        var rows = await db.Metingen.AsNoTracking()
            .Where(m => m.KunstwerkId == kunstwerkId.Waarde && m.Tijdstip >= start && m.Tijdstip <= eind)
            .ToListAsync();
        return rows.Select(MetingMapper.NaarDomein).ToList();
    }
}

public sealed class EfIncidentRepository(MonitoringDbContext db) : IIncidentRepository
{
    public async Task BewaarAsync(Incident incident)
    {
        var row = IncidentMapper.NaarRow(incident);
        var bestaand = await db.Incidenten.FindAsync(row.Id);
        if (bestaand is null) db.Incidenten.Add(row);
        else db.Entry(bestaand).CurrentValues.SetValues(row);
        await db.SaveChangesAsync();
    }

    public async Task<Incident?> ZoekAsync(IncidentId id)
    {
        var row = await db.Incidenten.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id.Waarde);
        return row is null ? null : IncidentMapper.NaarDomein(row);
    }

    public async Task<IReadOnlyList<Incident>> ZoekAsync(IncidentStatus? status, KunstwerkReferentie? kunstwerkId)
    {
        var q = db.Incidenten.AsNoTracking().AsQueryable();
        if (status is not null)
        {
            var s = status.Value.ToString();
            q = q.Where(i => i.Status == s);
        }
        if (kunstwerkId is not null)
            q = q.Where(i => i.KunstwerkId == kunstwerkId.Waarde);
        var rows = await q.ToListAsync();
        return rows.Select(IncidentMapper.NaarDomein).ToList();
    }

    public async Task<IReadOnlyList<Incident>> ZoekInPeriodeAsync(KunstwerkReferentie kunstwerkId, DateTime start, DateTime eind)
    {
        var rows = await db.Incidenten.AsNoTracking()
            .Where(i => i.KunstwerkId == kunstwerkId.Waarde && i.AangemaaktOp >= start && i.AangemaaktOp <= eind)
            .ToListAsync();
        return rows.Select(IncidentMapper.NaarDomein).ToList();
    }
}

public sealed class EfRapportRepository(MonitoringDbContext db) : IRapportRepository
{
    public async Task BewaarAsync(MonitoringRapport rapport)
    {
        db.Rapporten.Add(RapportMapper.NaarRow(rapport)); // write-once
        await db.SaveChangesAsync();
    }

    public async Task<MonitoringRapport?> ZoekAsync(RapportId id)
    {
        var row = await db.Rapporten.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id.Waarde);
        return row is null ? null : RapportMapper.NaarDomein(row);
    }

    public async Task<IReadOnlyList<MonitoringRapport>> ZoekAsync(KunstwerkReferentie? kunstwerkId)
    {
        var q = db.Rapporten.AsNoTracking().AsQueryable();
        if (kunstwerkId is not null)
            q = q.Where(r => r.KunstwerkId == kunstwerkId.Waarde);
        var rows = await q.ToListAsync();
        return rows.Select(RapportMapper.NaarDomein).ToList();
    }
}
```

- [ ] **Step 3: Read-model + klok + id-generator**

`monitoring/src/Monitoring.Infrastructure/Persistence/EfKunstwerkenReadModel.cs`:
```csharp
using Microsoft.EntityFrameworkCore;
using Monitoring.Application;
using Monitoring.Domain.Gedeeld;

namespace Monitoring.Infrastructure.Persistence;

public sealed class EfKunstwerkenReadModel(MonitoringDbContext db) : IKunstwerkenReadModel
{
    public async Task<bool> IsBekendEnInGebruikAsync(KunstwerkReferentie kunstwerkId)
    {
        var row = await db.BekendeKunstwerken.AsNoTracking().FirstOrDefaultAsync(k => k.KunstwerkId == kunstwerkId.Waarde);
        return row is { InGebruik: true };
    }

    public async Task<IReadOnlyList<KunstwerkReferentie>> AlleInGebruikAsync()
    {
        var ids = await db.BekendeKunstwerken.AsNoTracking().Where(k => k.InGebruik).Select(k => k.KunstwerkId).ToListAsync();
        return ids.Select(KunstwerkReferentie.Van).ToList();
    }
}
```

`monitoring/src/Monitoring.Infrastructure/SysteemKlok.cs`:
```csharp
using Monitoring.Application;

namespace Monitoring.Infrastructure;

public sealed class SysteemKlok : IKlok
{
    public DateTime Nu() => DateTime.UtcNow;
}
```

`monitoring/src/Monitoring.Infrastructure/UuidIdGenerator.cs`:
```csharp
using Monitoring.Application;

namespace Monitoring.Infrastructure;

public sealed class UuidIdGenerator : IIdGenerator
{
    public string Nieuw() => Guid.NewGuid().ToString();
}
```

- [ ] **Step 4: Tweede migratie + verificatie tegen echte DB**

Zorg dat postgres draait (`docker compose up -d postgres`). Run (in `monitoring/`):
```bash
DATABASE_URL=postgres://rws:rws@localhost:5432/monitoring_db \
  dotnet ef migrations add DomeinTabellen \
  --project src/Monitoring.Infrastructure --startup-project src/Monitoring.Api \
  --output-dir Persistence/Migrations
DATABASE_URL=postgres://rws:rws@localhost:5432/monitoring_db \
  dotnet ef database update --project src/Monitoring.Infrastructure --startup-project src/Monitoring.Api
dotnet build
```
Expected: migratie `DomeinTabellen` toegevoegd; `database update` maakt `monitoring_sessie`, `meting`, `incident`, `monitoring_rapport`; `dotnet build` groen. (Round-trips: Task 20.)

- [ ] **Step 5: Commit**

```bash
git add monitoring/
git commit -m "feat(monitoring): EF-repositories, read-model en domein-migratie"
```

---

### Task 15: Infrastructure — envelope + transactionele outbox + relay

De vaste envelope-JSON, de `OutboxEventPublisher` (schrijft events als envelope naar de DB), de `EfOutboxStore` en de `OutboxRelay` (`BackgroundService`). De relay-kernlogica staat los in een `OutboxRelayWerker` zodat die zonder broker/DB getest wordt.

> **Atomiciteit:** repositories en de `OutboxEventPublisher` schrijven naar dezelfde Postgres via dezelfde scoped `DbContext` (elk met een eigen `SaveChanges`). Dit spiegelt de Contract-service: events zijn durabel opgeslagen en de relay garandeert aflevering (at-least-once), i.p.v. publish-na-commit. Eén-transactie-atomiciteit is een genoteerde verfijning.

**Files:**
- Create: `monitoring/src/Monitoring.Infrastructure/Messaging/EnvelopeBouwer.cs`
- Create: `monitoring/src/Monitoring.Infrastructure/Messaging/IBerichtKanaal.cs`
- Create: `monitoring/src/Monitoring.Infrastructure/Messaging/OutboxEventPublisher.cs`
- Create: `monitoring/src/Monitoring.Infrastructure/Messaging/EfOutboxStore.cs`
- Create: `monitoring/src/Monitoring.Infrastructure/Messaging/OutboxRelay.cs`
- Test: `monitoring/test/Monitoring.UnitTests/Messaging/EnvelopeBouwerTests.cs`
- Test: `monitoring/test/Monitoring.UnitTests/Messaging/OutboxRelayWerkerTests.cs`

**Interfaces:**
- Produces: `static string EnvelopeBouwer.Bouw(IDomainEvent, string eventId, DateTime occurredAt)`.
- Produces: `interface IBerichtKanaal { Task PubliceerAsync(string routingKey, ReadOnlyMemory<byte> body); }`.
- Produces: `OutboxEventPublisher : IEventPublisher`.
- Produces: `record OutboxRegel(string Id, string RoutingKey, string Payload)`; `interface IOutboxStore { Task<IReadOnlyList<OutboxRegel>> PakOnverzondenAsync(int); Task MarkeerVerzondenAsync(IReadOnlyList<string>); }`; `EfOutboxStore : IOutboxStore`.
- Produces: `class OutboxRelayWerker(IOutboxStore, IBerichtKanaal)` met `Task<int> VerwerkBatchAsync(int batch)`; `class OutboxRelay : BackgroundService`.

- [ ] **Step 1: Package voor hosted services**

Run: `dotnet add src/Monitoring.Infrastructure package Microsoft.Extensions.Hosting.Abstractions --version 10.0.4`
Expected: `BackgroundService`/`IHostedService` beschikbaar.

- [ ] **Step 2: Write the failing tests**

`monitoring/test/Monitoring.UnitTests/Messaging/EnvelopeBouwerTests.cs`:
```csharp
using System.Text.Json;
using Monitoring.Domain.Gedeeld;
using Monitoring.Infrastructure.Messaging;
using Xunit;

namespace Monitoring.UnitTests.Messaging;

public class EnvelopeBouwerTests
{
    [Fact]
    public void Bouwt_de_vaste_envelope_met_producer_en_data()
    {
        var json = EnvelopeBouwer.Bouw(
            new IncidentAangemaakt("I1", "KW1", "Hoog", "iets", "Trilling", "Onderhoud"),
            "e-123", new DateTime(2026, 7, 1, 9, 0, 0, DateTimeKind.Utc));

        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        Assert.Equal("e-123", root.GetProperty("eventId").GetString());
        Assert.Equal("monitoring.incident.aangemaakt", root.GetProperty("eventType").GetString());
        Assert.Equal("2026-07-01T09:00:00.000Z", root.GetProperty("occurredAt").GetString());
        Assert.Equal("monitoring", root.GetProperty("producer").GetString());
        Assert.Equal(1, root.GetProperty("version").GetInt32());
        Assert.Equal("KW1", root.GetProperty("data").GetProperty("kunstwerkId").GetString());
        Assert.Equal("Hoog", root.GetProperty("data").GetProperty("ernst").GetString());
    }
}
```

`monitoring/test/Monitoring.UnitTests/Messaging/OutboxRelayWerkerTests.cs`:
```csharp
using System.Text;
using Monitoring.Infrastructure.Messaging;
using Xunit;

namespace Monitoring.UnitTests.Messaging;

public class OutboxRelayWerkerTests
{
    private sealed class FakeKanaal : IBerichtKanaal
    {
        public List<(string RoutingKey, string Body)> Verzonden { get; } = new();
        public Task PubliceerAsync(string routingKey, ReadOnlyMemory<byte> body)
        {
            Verzonden.Add((routingKey, Encoding.UTF8.GetString(body.Span)));
            return Task.CompletedTask;
        }
    }

    private sealed class FakeOutboxStore : IOutboxStore
    {
        private readonly List<OutboxRegel> _open;
        public FakeOutboxStore(params OutboxRegel[] regels) => _open = regels.ToList();
        public Task<IReadOnlyList<OutboxRegel>> PakOnverzondenAsync(int limiet) =>
            Task.FromResult<IReadOnlyList<OutboxRegel>>(_open.Take(limiet).ToList());
        public Task MarkeerVerzondenAsync(IReadOnlyList<string> ids)
        {
            _open.RemoveAll(r => ids.Contains(r.Id));
            return Task.CompletedTask;
        }
    }

    [Fact]
    public async Task Publiceert_onverzonden_regels_en_markeert_ze_daarna()
    {
        var kanaal = new FakeKanaal();
        var store = new FakeOutboxStore(
            new OutboxRegel("e1", "monitoring.meting.geregistreerd", "{\"eventId\":\"e1\"}"),
            new OutboxRegel("e2", "monitoring.incident.aangemaakt", "{\"eventId\":\"e2\"}"));
        var werker = new OutboxRelayWerker(store, kanaal);

        var aantal = await werker.VerwerkBatchAsync(50);
        Assert.Equal(2, aantal);
        Assert.Equal("monitoring.meting.geregistreerd", kanaal.Verzonden[0].RoutingKey);

        // tweede keer: niets meer over (idempotent)
        Assert.Equal(0, await werker.VerwerkBatchAsync(50));
    }
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `dotnet test test/Monitoring.UnitTests --filter "FullyQualifiedName~EnvelopeBouwer|FullyQualifiedName~OutboxRelayWerker"`
Expected: FAIL — types ontbreken.

- [ ] **Step 4: `EnvelopeBouwer` + `IBerichtKanaal`**

`monitoring/src/Monitoring.Infrastructure/Messaging/EnvelopeBouwer.cs`:
```csharp
using System.Text.Json;
using Monitoring.Domain.Gedeeld;

namespace Monitoring.Infrastructure.Messaging;

public static class EnvelopeBouwer
{
    public static string Bouw(IDomainEvent domeinEvent, string eventId, DateTime occurredAt)
    {
        var envelope = new Dictionary<string, object?>
        {
            ["eventId"] = eventId,
            ["eventType"] = domeinEvent.EventType,
            ["occurredAt"] = occurredAt.NaarIso(),
            ["producer"] = "monitoring",
            ["version"] = 1,
            ["data"] = domeinEvent.Data,
        };
        return JsonSerializer.Serialize(envelope, Serialisatie.Opties);
    }
}
```

`monitoring/src/Monitoring.Infrastructure/Messaging/IBerichtKanaal.cs`:
```csharp
namespace Monitoring.Infrastructure.Messaging;

public interface IBerichtKanaal
{
    Task PubliceerAsync(string routingKey, ReadOnlyMemory<byte> body);
}
```

- [ ] **Step 5: `OutboxEventPublisher`**

`monitoring/src/Monitoring.Infrastructure/Messaging/OutboxEventPublisher.cs`:
```csharp
using Monitoring.Application;
using Monitoring.Domain.Gedeeld;
using Monitoring.Infrastructure.Persistence;
using Monitoring.Infrastructure.Persistence.Rows;

namespace Monitoring.Infrastructure.Messaging;

public sealed class OutboxEventPublisher(MonitoringDbContext db, IIdGenerator ids, IKlok klok) : IEventPublisher
{
    public async Task PubliceerAsync(IReadOnlyList<IDomainEvent> events)
    {
        if (events.Count == 0) return;
        var nu = klok.Nu();
        foreach (var domeinEvent in events)
        {
            var eventId = ids.Nieuw();
            db.Outbox.Add(new OutboxMessageRow
            {
                Id = eventId,
                EventType = domeinEvent.EventType,
                RoutingKey = domeinEvent.EventType,
                Payload = EnvelopeBouwer.Bouw(domeinEvent, eventId, nu),
                Gepubliceerd = false,
                AangemaaktOp = nu,
            });
        }
        await db.SaveChangesAsync();
    }
}
```

- [ ] **Step 6: `EfOutboxStore`**

`monitoring/src/Monitoring.Infrastructure/Messaging/EfOutboxStore.cs`:
```csharp
using Microsoft.EntityFrameworkCore;
using Monitoring.Infrastructure.Persistence;

namespace Monitoring.Infrastructure.Messaging;

public sealed record OutboxRegel(string Id, string RoutingKey, string Payload);

public interface IOutboxStore
{
    Task<IReadOnlyList<OutboxRegel>> PakOnverzondenAsync(int limiet);
    Task MarkeerVerzondenAsync(IReadOnlyList<string> ids);
}

public sealed class EfOutboxStore(MonitoringDbContext db) : IOutboxStore
{
    public async Task<IReadOnlyList<OutboxRegel>> PakOnverzondenAsync(int limiet)
    {
        var rows = await db.Outbox.AsNoTracking()
            .Where(o => !o.Gepubliceerd)
            .OrderBy(o => o.AangemaaktOp)
            .Take(limiet)
            .ToListAsync();
        return rows.Select(o => new OutboxRegel(o.Id, o.RoutingKey, o.Payload)).ToList();
    }

    public async Task MarkeerVerzondenAsync(IReadOnlyList<string> ids)
    {
        if (ids.Count == 0) return;
        await db.Outbox
            .Where(o => ids.Contains(o.Id))
            .ExecuteUpdateAsync(s => s
                .SetProperty(o => o.Gepubliceerd, true)
                .SetProperty(o => o.GepubliceerdOp, DateTime.UtcNow));
    }
}
```

- [ ] **Step 7: `OutboxRelayWerker` + `OutboxRelay`**

`monitoring/src/Monitoring.Infrastructure/Messaging/OutboxRelay.cs`:
```csharp
using System.Text;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Monitoring.Infrastructure.Messaging;

public sealed class OutboxRelayWerker(IOutboxStore store, IBerichtKanaal kanaal)
{
    public async Task<int> VerwerkBatchAsync(int batch)
    {
        var regels = await store.PakOnverzondenAsync(batch);
        if (regels.Count == 0) return 0;

        var verzonden = new List<string>();
        foreach (var regel in regels)
        {
            await kanaal.PubliceerAsync(regel.RoutingKey, Encoding.UTF8.GetBytes(regel.Payload));
            verzonden.Add(regel.Id);
        }
        await store.MarkeerVerzondenAsync(verzonden);
        return verzonden.Count;
    }
}

public sealed class OutboxRelay(IServiceProvider services, IBerichtKanaal kanaal, ILogger<OutboxRelay> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stopping)
    {
        while (!stopping.IsCancellationRequested)
        {
            try
            {
                using var scope = services.CreateScope();
                var store = scope.ServiceProvider.GetRequiredService<IOutboxStore>();
                await new OutboxRelayWerker(store, kanaal).VerwerkBatchAsync(50);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "outbox-relay batch mislukt");
            }
            try { await Task.Delay(TimeSpan.FromSeconds(1), stopping); }
            catch (TaskCanceledException) { break; }
        }
    }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `dotnet test test/Monitoring.UnitTests --filter "FullyQualifiedName~EnvelopeBouwer|FullyQualifiedName~OutboxRelayWerker"`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add monitoring/
git commit -m "feat(monitoring): envelope, transactionele outbox en relay"
```

---

### Task 16: Infrastructure — RabbitMQ-kanaal + idempotente Beheer-kunstwerk-consumer

De concrete `IBerichtKanaal` (raw `BasicPublishAsync`), de dedup/store-poorten met EF-impl, de testbare `BeheerKunstwerkVerwerker` (idempotent, anti-corruption) en de `BeheerKunstwerkConsumer` (`IHostedService`, eigen kanaal).

**Files:**
- Modify: `monitoring/src/Monitoring.Infrastructure/Messaging/RabbitMqConnectie.cs` (voeg `MaakKanaalAsync` toe)
- Create: `monitoring/src/Monitoring.Infrastructure/Messaging/RabbitMqBerichtKanaal.cs`
- Create: `monitoring/src/Monitoring.Infrastructure/Messaging/Consumers.cs` (dedup, store, verwerker, consumer)
- Test: `monitoring/test/Monitoring.UnitTests/Messaging/BeheerKunstwerkVerwerkerTests.cs`

**Interfaces:**
- Produces: `Task<IChannel> RabbitMqConnectie.MaakKanaalAsync()`.
- Produces: `RabbitMqBerichtKanaal : IBerichtKanaal`.
- Produces: `interface IEventDedup { Task<bool> IsVerwerktAsync(string); Task MarkeerVerwerktAsync(string); }` + `EfEventDedup`.
- Produces: `interface IKunstwerkenStore { Task UpsertAsync(string, string?, string?); Task MarkeerBuitenGebruikAsync(string); }` + `EfKunstwerkenStore`.
- Produces: `class BeheerKunstwerkVerwerker(IKunstwerkenStore, IEventDedup)` met `Task VerwerkAsync(string berichtJson)`; `class BeheerKunstwerkConsumer : IHostedService`.

- [ ] **Step 1: `MaakKanaalAsync` toevoegen aan `RabbitMqConnectie`**

Voeg in `monitoring/src/Monitoring.Infrastructure/Messaging/RabbitMqConnectie.cs` een methode toe (binnen de klasse, na de `IsVerbonden`-property):
```csharp
    public Task<IChannel> MaakKanaalAsync() => _connectie.CreateChannelAsync();
```

- [ ] **Step 2: `RabbitMqBerichtKanaal`**

`monitoring/src/Monitoring.Infrastructure/Messaging/RabbitMqBerichtKanaal.cs`:
```csharp
using RabbitMQ.Client;

namespace Monitoring.Infrastructure.Messaging;

public sealed class RabbitMqBerichtKanaal(RabbitMqConnectie connectie) : IBerichtKanaal
{
    public async Task PubliceerAsync(string routingKey, ReadOnlyMemory<byte> body)
    {
        var props = new BasicProperties { Persistent = true };
        await connectie.Kanaal.BasicPublishAsync(
            exchange: RabbitMqConnectie.Exchange,
            routingKey: routingKey,
            mandatory: false,
            basicProperties: props,
            body: body);
    }
}
```

- [ ] **Step 3: Write the failing test**

`monitoring/test/Monitoring.UnitTests/Messaging/BeheerKunstwerkVerwerkerTests.cs`:
```csharp
using Monitoring.Infrastructure.Messaging;
using Xunit;

namespace Monitoring.UnitTests.Messaging;

public class BeheerKunstwerkVerwerkerTests
{
    private sealed class FakeStore : IKunstwerkenStore
    {
        public List<string> Upserts { get; } = new();
        public List<string> BuitenGebruik { get; } = new();
        public Task UpsertAsync(string kunstwerkId, string? type, string? locatie) { Upserts.Add(kunstwerkId); return Task.CompletedTask; }
        public Task MarkeerBuitenGebruikAsync(string kunstwerkId) { BuitenGebruik.Add(kunstwerkId); return Task.CompletedTask; }
    }

    private sealed class FakeDedup : IEventDedup
    {
        public HashSet<string> Verwerkt { get; } = new();
        public Task<bool> IsVerwerktAsync(string eventId) => Task.FromResult(Verwerkt.Contains(eventId));
        public Task MarkeerVerwerktAsync(string eventId) { Verwerkt.Add(eventId); return Task.CompletedTask; }
    }

    private static string Envelope(string eventId, string eventType, string kunstwerkId) =>
        $$"""{"eventId":"{{eventId}}","eventType":"{{eventType}}","occurredAt":"2026-07-01T09:00:00.000Z","producer":"beheer","version":1,"data":{"kunstwerkId":"{{kunstwerkId}}","type":"brug","locatie":"A2"}}""";

    [Fact]
    public async Task Verwerkt_geregistreerd_als_upsert_in_het_read_model()
    {
        var store = new FakeStore();
        var verwerker = new BeheerKunstwerkVerwerker(store, new FakeDedup());
        await verwerker.VerwerkAsync(Envelope("e1", "beheer.kunstwerk.geregistreerd", "KW1"));
        Assert.Equal(new[] { "KW1" }, store.Upserts);
    }

    [Fact]
    public async Task Verwerkt_buitengebruikstelling_als_markering()
    {
        var store = new FakeStore();
        var verwerker = new BeheerKunstwerkVerwerker(store, new FakeDedup());
        await verwerker.VerwerkAsync(Envelope("e2", "beheer.kunstwerk.buitengebruikgesteld", "KW1"));
        Assert.Equal(new[] { "KW1" }, store.BuitenGebruik);
    }

    [Fact]
    public async Task Is_idempotent_op_eventId()
    {
        var store = new FakeStore();
        var dedup = new FakeDedup();
        var verwerker = new BeheerKunstwerkVerwerker(store, dedup);
        await verwerker.VerwerkAsync(Envelope("e3", "beheer.kunstwerk.geregistreerd", "KW1"));
        await verwerker.VerwerkAsync(Envelope("e3", "beheer.kunstwerk.geregistreerd", "KW1"));
        Assert.Single(store.Upserts); // tweede keer overgeslagen
    }
}
```

- [ ] **Step 4: Run test to verify it fails**

Run: `dotnet test test/Monitoring.UnitTests --filter FullyQualifiedName~BeheerKunstwerkVerwerker`
Expected: FAIL — types ontbreken.

- [ ] **Step 5: Dedup, store, verwerker, consumer**

`monitoring/src/Monitoring.Infrastructure/Messaging/Consumers.cs`:
```csharp
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Monitoring.Infrastructure.Persistence;
using Monitoring.Infrastructure.Persistence.Rows;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace Monitoring.Infrastructure.Messaging;

public interface IEventDedup
{
    Task<bool> IsVerwerktAsync(string eventId);
    Task MarkeerVerwerktAsync(string eventId);
}

public sealed class EfEventDedup(MonitoringDbContext db) : IEventDedup
{
    public Task<bool> IsVerwerktAsync(string eventId) =>
        db.VerwerkteEvents.AsNoTracking().AnyAsync(v => v.EventId == eventId);

    public async Task MarkeerVerwerktAsync(string eventId)
    {
        db.VerwerkteEvents.Add(new VerwerktEventRow { EventId = eventId, VerwerktOp = DateTime.UtcNow });
        await db.SaveChangesAsync();
    }
}

public interface IKunstwerkenStore
{
    Task UpsertAsync(string kunstwerkId, string? type, string? locatie);
    Task MarkeerBuitenGebruikAsync(string kunstwerkId);
}

public sealed class EfKunstwerkenStore(MonitoringDbContext db) : IKunstwerkenStore
{
    public async Task UpsertAsync(string kunstwerkId, string? type, string? locatie)
    {
        var row = await db.BekendeKunstwerken.FindAsync(kunstwerkId);
        if (row is null)
            db.BekendeKunstwerken.Add(new BekendKunstwerkRow
            {
                KunstwerkId = kunstwerkId, Type = type, Locatie = locatie, InGebruik = true, BijgewerktOp = DateTime.UtcNow,
            });
        else
        {
            row.Type = type;
            row.Locatie = locatie;
            row.InGebruik = true;
            row.BijgewerktOp = DateTime.UtcNow;
        }
        await db.SaveChangesAsync();
    }

    public async Task MarkeerBuitenGebruikAsync(string kunstwerkId)
    {
        var row = await db.BekendeKunstwerken.FindAsync(kunstwerkId);
        if (row is null) return;
        row.InGebruik = false;
        row.BijgewerktOp = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }
}

/// <summary>Vertaalt beheer.kunstwerk.*-events naar het lokale read-model (anti-corruption), idempotent.</summary>
public sealed class BeheerKunstwerkVerwerker(IKunstwerkenStore store, IEventDedup dedup)
{
    public async Task VerwerkAsync(string berichtJson)
    {
        using var doc = JsonDocument.Parse(berichtJson);
        var root = doc.RootElement;

        var eventId = root.TryGetProperty("eventId", out var idEl) ? idEl.GetString() ?? "" : "";
        if (eventId.Length == 0) return;
        if (await dedup.IsVerwerktAsync(eventId)) return;

        var eventType = root.TryGetProperty("eventType", out var typeEl) ? typeEl.GetString() ?? "" : "";
        var data = root.GetProperty("data");
        var kunstwerkId = data.TryGetProperty("kunstwerkId", out var kEl) ? kEl.GetString() ?? "" : "";
        if (kunstwerkId.Length == 0) return;

        if (eventType == "beheer.kunstwerk.geregistreerd")
        {
            var type = data.TryGetProperty("type", out var t) ? t.GetString() : null;
            var locatie = data.TryGetProperty("locatie", out var l) ? l.GetString() : null;
            await store.UpsertAsync(kunstwerkId, type, locatie);
        }
        else if (eventType == "beheer.kunstwerk.buitengebruikgesteld")
        {
            await store.MarkeerBuitenGebruikAsync(kunstwerkId);
        }

        await dedup.MarkeerVerwerktAsync(eventId);
    }
}

public sealed class BeheerKunstwerkConsumer(
    RabbitMqConnectie connectie,
    IServiceProvider services,
    ILogger<BeheerKunstwerkConsumer> logger) : IHostedService
{
    private const string Queue = "monitoring.beheer-kunstwerk";
    private IChannel? _kanaal;

    public async Task StartAsync(CancellationToken ct)
    {
        _kanaal = await connectie.MaakKanaalAsync();
        await _kanaal.QueueDeclareAsync(Queue, durable: true, exclusive: false, autoDelete: false, cancellationToken: ct);
        await _kanaal.QueueBindAsync(Queue, RabbitMqConnectie.Exchange, "beheer.kunstwerk.*", cancellationToken: ct);

        var consumer = new AsyncEventingBasicConsumer(_kanaal);
        consumer.ReceivedAsync += async (_, ea) =>
        {
            var json = Encoding.UTF8.GetString(ea.Body.Span);
            try
            {
                using var scope = services.CreateScope();
                var verwerker = new BeheerKunstwerkVerwerker(
                    scope.ServiceProvider.GetRequiredService<IKunstwerkenStore>(),
                    scope.ServiceProvider.GetRequiredService<IEventDedup>());
                await verwerker.VerwerkAsync(json);
                await _kanaal!.BasicAckAsync(ea.DeliveryTag, multiple: false);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "verwerken beheer-kunstwerk-event mislukt");
                await _kanaal!.BasicNackAsync(ea.DeliveryTag, multiple: false, requeue: false);
            }
        };

        await _kanaal.BasicConsumeAsync(Queue, autoAck: false, consumer: consumer, cancellationToken: ct);
    }

    public async Task StopAsync(CancellationToken ct)
    {
        if (_kanaal is not null)
            await _kanaal.CloseAsync(ct);
    }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `dotnet test test/Monitoring.UnitTests --filter FullyQualifiedName~BeheerKunstwerkVerwerker`
Expected: PASS. Draai de hele unit-suite `dotnet test test/Monitoring.UnitTests` → alles groen.

- [ ] **Step 7: Commit**

```bash
git add monitoring/
git commit -m "feat(monitoring): RabbitMQ-kanaal en idempotente beheer-kunstwerk-consumer"
```

---

### Task 17: Interface — Minimal API-endpoints, DTO's + foutafhandeling

De dunne HTTP-laag: request/response-DTO's, de endpoint-groepen onder `/api`, en de middleware die `DomeinFout` → HTTP 400 mapt. De volledige bedrading (DI + OpenAPI + hosted services) volgt in Task 18; de gate hier is een groene build.

**Files:**
- Create: `monitoring/src/Monitoring.Api/Dtos.cs`
- Create: `monitoring/src/Monitoring.Api/DomeinFoutMiddleware.cs`
- Create: `monitoring/src/Monitoring.Api/Endpoints.cs`

**Interfaces:**
- Produces: response-DTO's `SessieDto`, `MetingDto`, `IncidentDto`, `RapportDto` (elk `static Van(domein)`); request-records `StartSessieRequest`, `RegistreerMetingRequest`, `StelRapportOpRequest`, `StelNetwerkrapportageRequest`.
- Produces: `DomeinFoutMiddleware`.
- Produces: extension `IEndpointRouteBuilder.MapMonitoringEndpoints()` die alle `/api`-routes registreert.

- [ ] **Step 1: DTO's**

`monitoring/src/Monitoring.Api/Dtos.cs`:
```csharp
using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Incidenten;
using Monitoring.Domain.Rapporten;
using Monitoring.Domain.Sessies;

namespace Monitoring.Api;

public sealed record StartSessieRequest(string KunstwerkId);
public sealed record RegistreerMetingRequest(string KunstwerkId, string SensorType, double Waarde);
public sealed record StelRapportOpRequest(string KunstwerkId, DateTime PeriodeStart, DateTime PeriodeEind);
public sealed record StelNetwerkrapportageRequest(DateTime PeriodeStart, DateTime PeriodeEind);

public sealed record SessieDto(string Id, string KunstwerkId, string Status, string GestartOp, string? BeeindigdOp, int AantalMetingen)
{
    public static SessieDto Van(MonitoringSessie s) =>
        new(s.Id.Waarde, s.KunstwerkId.Waarde, s.Status.ToString(), s.GestartOp.NaarIso(), s.BeeindigdOp?.NaarIso(), s.AantalMetingen);
}

public sealed record MetingDto(string Id, string KunstwerkId, string SensorType, double Waarde, string Eenheid, string Tijdstip)
{
    public static MetingDto Van(Meting m) =>
        new(m.Id.Waarde, m.KunstwerkId.Waarde, m.SensorData.SensorType.ToString(), m.SensorData.Waarde, m.SensorData.Eenheid, m.Tijdstip.NaarIso());
}

public sealed record IncidentDto(string Id, string KunstwerkId, string SensorType, double GemetenWaarde, double Drempelwaarde,
    string Ernst, string Omschrijving, string Vervolgactie, string Status, string AangemaaktOp, string? OpgelostOp)
{
    public static IncidentDto Van(Incident i) =>
        new(i.Id.Waarde, i.KunstwerkId.Waarde, i.SensorType.ToString(), i.GemetenWaarde, i.Drempelwaarde, i.Ernst.ToString(),
            i.Omschrijving, i.Vervolgactie.ToString(), i.Status.ToString(), i.AangemaaktOp.NaarIso(), i.OpgelostOp?.NaarIso());
}

public sealed record RapportDto(string Id, string KunstwerkId, string PeriodeStart, string PeriodeEind,
    string? ZwaarsteOpenIncidentId, RapportResultaten Resultaten, string OpgesteldOp)
{
    public static RapportDto Van(MonitoringRapport r) =>
        new(r.Id.Waarde, r.KunstwerkId.Waarde, r.PeriodeStart.NaarIso(), r.PeriodeEind.NaarIso(),
            r.ZwaarsteOpenIncident?.Waarde, r.Resultaten, r.OpgesteldOp.NaarIso());
}
```

- [ ] **Step 2: `DomeinFoutMiddleware`**

`monitoring/src/Monitoring.Api/DomeinFoutMiddleware.cs`:
```csharp
using Monitoring.Domain.Gedeeld;

namespace Monitoring.Api;

public sealed class DomeinFoutMiddleware(RequestDelegate next)
{
    public async Task Invoke(HttpContext ctx)
    {
        try
        {
            await next(ctx);
        }
        catch (DomeinFout fout)
        {
            ctx.Response.StatusCode = StatusCodes.Status400BadRequest;
            await ctx.Response.WriteAsJsonAsync(new { fout = fout.Message });
        }
    }
}
```

- [ ] **Step 3: Endpoints**

`monitoring/src/Monitoring.Api/Endpoints.cs`:
```csharp
using Monitoring.Application;
using Monitoring.Application.Incidenten;
using Monitoring.Application.Metingen;
using Monitoring.Application.Rapporten;
using Monitoring.Application.Sessies;
using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Incidenten;

namespace Monitoring.Api;

public static class Endpoints
{
    public static void MapMonitoringEndpoints(this IEndpointRouteBuilder app)
    {
        var sessies = app.MapGroup("/api/sessies");
        sessies.MapPost("", async (StartSessieRequest req, StartMonitoringSessie uc) =>
        {
            var id = await uc.UitvoerenAsync(new StartMonitoringSessieCommand(req.KunstwerkId));
            return Results.Created($"/api/sessies/{id}", new { id });
        });
        sessies.MapPost("/{id}/pauzering", async (string id, PauzeerMonitoringSessie uc) =>
        {
            await uc.UitvoerenAsync(id);
            return Results.NoContent();
        });
        sessies.MapPost("/{id}/hervatting", async (string id, HervatMonitoringSessie uc) =>
        {
            await uc.UitvoerenAsync(id);
            return Results.NoContent();
        });
        sessies.MapPost("/{id}/afronding", async (string id, RondMonitoringSessieAf uc) =>
        {
            await uc.UitvoerenAsync(id);
            return Results.NoContent();
        });
        sessies.MapGet("", async (IMonitoringSessieRepository repo) =>
            Results.Ok((await repo.ZoekAlleAsync()).Select(SessieDto.Van)));
        sessies.MapGet("/{id}", async (string id, IMonitoringSessieRepository repo) =>
        {
            var s = await repo.ZoekAsync(SessieId.Van(id));
            return s is null ? Results.NotFound() : Results.Ok(SessieDto.Van(s));
        });

        var metingen = app.MapGroup("/api/metingen");
        metingen.MapPost("", async (RegistreerMetingRequest req, RegistreerMeting uc) =>
        {
            var r = await uc.UitvoerenAsync(new RegistreerMetingCommand(req.KunstwerkId, req.SensorType, req.Waarde));
            return Results.Created($"/api/metingen/{r.MetingId}", r);
        });
        metingen.MapGet("", async (string kunstwerkId, string? sensorType, IMetingRepository repo) =>
        {
            SensorType? st = sensorType is null ? null : Enum.Parse<SensorType>(sensorType);
            var gevonden = await repo.ZoekAsync(KunstwerkReferentie.Van(kunstwerkId), st);
            return Results.Ok(gevonden.Select(MetingDto.Van));
        });

        var incidenten = app.MapGroup("/api/incidenten");
        incidenten.MapPost("/{id}/inbehandelingname", async (string id, NeemIncidentInBehandeling uc) =>
        {
            await uc.UitvoerenAsync(id);
            return Results.NoContent();
        });
        incidenten.MapPost("/{id}/oplossing", async (string id, LosIncidentOp uc) =>
        {
            await uc.UitvoerenAsync(id);
            return Results.NoContent();
        });
        incidenten.MapGet("", async (string? status, string? kunstwerkId, IIncidentRepository repo) =>
        {
            IncidentStatus? st = status is null ? null : Enum.Parse<IncidentStatus>(status);
            KunstwerkReferentie? kw = kunstwerkId is null ? null : KunstwerkReferentie.Van(kunstwerkId);
            return Results.Ok((await repo.ZoekAsync(st, kw)).Select(IncidentDto.Van));
        });
        incidenten.MapGet("/{id}", async (string id, IIncidentRepository repo) =>
        {
            var i = await repo.ZoekAsync(IncidentId.Van(id));
            return i is null ? Results.NotFound() : Results.Ok(IncidentDto.Van(i));
        });

        var rapporten = app.MapGroup("/api/rapporten");
        rapporten.MapPost("", async (StelRapportOpRequest req, StelRapportOp uc) =>
        {
            var id = await uc.UitvoerenAsync(new StelRapportOpCommand(req.KunstwerkId, req.PeriodeStart, req.PeriodeEind));
            return Results.Created($"/api/rapporten/{id}", new { id });
        });
        rapporten.MapGet("", async (string? kunstwerkId, IRapportRepository repo) =>
        {
            KunstwerkReferentie? kw = kunstwerkId is null ? null : KunstwerkReferentie.Van(kunstwerkId);
            return Results.Ok((await repo.ZoekAsync(kw)).Select(RapportDto.Van));
        });
        rapporten.MapGet("/{id}", async (string id, IRapportRepository repo) =>
        {
            var r = await repo.ZoekAsync(RapportId.Van(id));
            return r is null ? Results.NotFound() : Results.Ok(RapportDto.Van(r));
        });

        app.MapPost("/api/netwerkrapportages", async (StelNetwerkrapportageRequest req, StelNetwerkrapportageOp uc) =>
        {
            var id = await uc.UitvoerenAsync(new StelNetwerkrapportageOpCommand(req.PeriodeStart, req.PeriodeEind));
            return Results.Created($"/api/netwerkrapportages/{id}", new { id });
        });
    }
}
```

- [ ] **Step 4: Build to verify it compiles**

Run: `dotnet build src/Monitoring.Api`
Expected: build slaagt (endpoints refereren use cases/ports die Task 18 in DI registreert; e2e-gedrag komt in Task 20).

- [ ] **Step 5: Commit**

```bash
git add monitoring/
git commit -m "feat(monitoring): Minimal API-endpoints, DTO's en foutafhandeling"
```

---

### Task 18: Composition root — `Program.cs` volledig bedraden

Bedraad alles: DbContext, RabbitMQ, repositories, read-model, outbox-publisher/-store, dedup/store, use cases, hosted services (consumer + relay), OpenAPI/Scalar, migrate-op-startup, foutmiddleware, endpoints en de volledige `/health`. Dit is het integratiemoment: de service draait end-to-end.

**Files:**
- Modify: `monitoring/src/Monitoring.Api/Program.cs` (volledige composition root)

- [ ] **Step 1: OpenAPI/Scalar-packages**

Run (in `monitoring/`):
```bash
dotnet add src/Monitoring.Api package Microsoft.AspNetCore.OpenApi --version 10.0.4
dotnet add src/Monitoring.Api package Scalar.AspNetCore
```
Expected: `AddOpenApi`/`MapScalarApiReference` beschikbaar (Scalar ≥ 2.x).

- [ ] **Step 2: Volledige `Program.cs`**

Vervang `monitoring/src/Monitoring.Api/Program.cs`:
```csharp
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
```

- [ ] **Step 3: End-to-end handmatige verificatie**

Start infra vanuit repo-root: `docker compose up -d postgres rabbitmq`. Dan (in `monitoring/`):
```bash
SERVICE_PORT=8002 \
  DATABASE_URL=postgres://rws:rws@localhost:5432/monitoring_db \
  RABBITMQ_URL=amqp://rws:rws@localhost:5672 \
  KUNSTWERK_VALIDATIE=soepel \
  dotnet run --project src/Monitoring.Api &
sleep 6
curl -s localhost:8002/health; echo
# start een sessie
SID=$(curl -s -XPOST localhost:8002/api/sessies -H 'content-type: application/json' -d '{"kunstwerkId":"KW-1"}' | sed -E 's/.*"id":"([^"]+)".*/\1/'); echo "sessie=$SID"
# een afwijkende trillingsmeting -> incident
curl -s -XPOST localhost:8002/api/metingen -H 'content-type: application/json' -d '{"kunstwerkId":"KW-1","sensorType":"Trilling","waarde":10}'; echo
curl -s 'localhost:8002/api/incidenten?kunstwerkId=KW-1'; echo
kill %1
```
Expected: `/health` = `{"status":"ok",...}`; sessie krijgt een id; de meting geeft een `incidentId`; `GET /api/incidenten` toont één `Kritiek`-incident met vervolgactie `Onderhoud`. Open `http://localhost:8002/api/docs` → Scalar toont alle endpoints. Controleer op `http://localhost:15672` (rws/rws) dat de queue `monitoring.beheer-kunstwerk` bestaat en dat er (via de outbox-relay) berichten op `rws.events` met key `monitoring.*` zijn gepubliceerd (bind een tijdelijke queue op `monitoring.#`).

- [ ] **Step 4: Commit**

```bash
git add monitoring/
git commit -m "feat(monitoring): composition root — service volledig bedraad en draaiend"
```

---

### Task 19: Docker, compose-blok + `events.md`

Multi-stage Dockerfile (migrate-op-startup zit in `Program.cs`), het `monitoring:`-blok in `docker-compose.yml` activeren, en het nieuwe event registreren in het gedeelde contract.

**Files:**
- Create: `monitoring/Dockerfile` (overschrijf template)
- Create: `monitoring/.dockerignore`
- Modify: `docker-compose.yml` (uncomment `monitoring:`)
- Modify: `docs/events.md` (voeg netwerkrapportage-rij toe)

- [ ] **Step 1: Dockerfile**

`monitoring/Dockerfile` (overschrijf de bestaande template):
```dockerfile
# Monitoring-service — .NET 10 multi-stage
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY src/ ./src/
RUN dotnet publish src/Monitoring.Api/Monitoring.Api.csproj -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app ./
EXPOSE 8002
ENTRYPOINT ["dotnet", "Monitoring.Api.dll"]
```

- [ ] **Step 2: `.dockerignore`**

`monitoring/.dockerignore`:
```
**/bin
**/obj
.env
```

- [ ] **Step 3: `.env` aanmaken**

Run (in `monitoring/`): `cp .env.example .env`
> In het compose-netwerk vinden de services elkaar op containernaam. `.env` is de compose-variant; laat `DATABASE_URL`/`RABBITMQ_URL` op de containernamen (`postgres`/`rabbitmq`) staan.

- [ ] **Step 4: compose-blok activeren**

Vervang in `docker-compose.yml` het gecommente `monitoring:`-blok door:
```yaml
  monitoring:
    build: ./monitoring
    container_name: rws-monitoring
    env_file: ./monitoring/.env
    ports: ["8002:8002"]
    depends_on:
      rabbitmq: { condition: service_healthy }
      postgres: { condition: service_healthy }
    networks: [rws-net]
```

- [ ] **Step 5: `events.md` bijwerken**

Voeg in `docs/events.md` in de eventcatalogus-tabel, direct ná de rij `monitoring.rapport.opgesteld`, deze rij toe:
```
| `monitoring.netwerkrapportage.opgesteld` | Monitoring | `periode` {start,eind}, `opgesteldOp`, `kunstwerken[]` (`kunstwerkId`, `aantalMetingen`, `aantalIncidenten`, `zwaarsteErnst`) |
```

- [ ] **Step 6: Verificatie via compose**

Run vanuit de repo-root:
```bash
docker compose up -d --build monitoring
sleep 12
curl -s localhost:8002/health; echo
docker compose logs --tail=20 monitoring
```
Expected: image bouwt, container `rws-monitoring` draait, `/health` = 200 (200 pas nadat migraties zijn toegepast). `docker compose down` om op te ruimen.

- [ ] **Step 7: Commit**

```bash
git add monitoring/Dockerfile monitoring/.dockerignore docker-compose.yml docs/events.md
git commit -m "feat(monitoring): Dockerfile, compose-blok en netwerkrapportage-event in events.md"
```

---

### Task 20: Integratietests (Testcontainers) — Fase 2

End-to-end tests tegen een echte Postgres + RabbitMQ (Testcontainers): HTTP-flow → DB, outbox → relay → `rws.events`, en de idempotente beheer-consumer. **Vereist een draaiende Docker.**

**Files:**
- Create: `monitoring/test/Monitoring.IntegrationTests/MonitoringAppFixture.cs`
- Create: `monitoring/test/Monitoring.IntegrationTests/MonitoringIntegratieTests.cs`

- [ ] **Step 1: Packages**

Run (in `monitoring/`):
```bash
dotnet add test/Monitoring.IntegrationTests package Testcontainers.PostgreSql --version 4.12.0
dotnet add test/Monitoring.IntegrationTests package Testcontainers.RabbitMq --version 4.12.0
dotnet add test/Monitoring.IntegrationTests package Microsoft.AspNetCore.Mvc.Testing --version 10.0.4
dotnet add test/Monitoring.IntegrationTests package RabbitMQ.Client --version 7.1.2
```
Expected: packages toegevoegd (`Microsoft.EntityFrameworkCore` komt transitief via de Infrastructure-referentie).

- [ ] **Step 2: Fixture (start containers, boot de app)**

`monitoring/test/Monitoring.IntegrationTests/MonitoringAppFixture.cs`:
```csharp
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
```

- [ ] **Step 3: Write the integration tests**

`monitoring/test/Monitoring.IntegrationTests/MonitoringIntegratieTests.cs`:
```csharp
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Monitoring.Infrastructure.Persistence;
using RabbitMQ.Client;
using Xunit;

namespace Monitoring.IntegrationTests;

public class MonitoringIntegratieTests(MonitoringAppFixture fixture) : IClassFixture<MonitoringAppFixture>
{
    [Fact]
    public async Task Meting_boven_drempel_leidt_via_de_API_tot_een_incident()
    {
        var client = fixture.Factory.CreateClient();
        (await client.PostAsJsonAsync("/api/sessies", new { kunstwerkId = "KW-A" })).EnsureSuccessStatusCode();
        (await client.PostAsJsonAsync("/api/metingen", new { kunstwerkId = "KW-A", sensorType = "Trilling", waarde = 10.0 }))
            .EnsureSuccessStatusCode();

        var incidenten = await client.GetFromJsonAsync<List<JsonElement>>("/api/incidenten?kunstwerkId=KW-A");
        Assert.Single(incidenten!);
        Assert.Equal("Kritiek", incidenten![0].GetProperty("ernst").GetString());
    }

    [Fact]
    public async Task Incident_event_stroomt_via_de_outbox_relay_naar_rws_events()
    {
        await using var conn = await new ConnectionFactory { Uri = new Uri(fixture.AmqpUrl) }.CreateConnectionAsync();
        await using var ch = await conn.CreateChannelAsync();
        await ch.ExchangeDeclareAsync("rws.events", ExchangeType.Topic, durable: true);
        var q = await ch.QueueDeclareAsync("", durable: false, exclusive: true, autoDelete: true);
        await ch.QueueBindAsync(q.QueueName, "rws.events", "monitoring.#");

        var client = fixture.Factory.CreateClient();
        (await client.PostAsJsonAsync("/api/sessies", new { kunstwerkId = "KW-B" })).EnsureSuccessStatusCode();
        (await client.PostAsJsonAsync("/api/metingen", new { kunstwerkId = "KW-B", sensorType = "Trilling", waarde = 10.0 }))
            .EnsureSuccessStatusCode();

        string? gevonden = null;
        for (var i = 0; i < 40 && gevonden is null; i++)
        {
            var res = await ch.BasicGetAsync(q.QueueName, autoAck: true);
            if (res is not null)
            {
                var json = Encoding.UTF8.GetString(res.Body.Span);
                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.GetProperty("eventType").GetString() == "monitoring.incident.aangemaakt")
                {
                    Assert.Equal("monitoring", doc.RootElement.GetProperty("producer").GetString());
                    gevonden = json;
                }
            }
            else
            {
                await Task.Delay(500);
            }
        }
        Assert.NotNull(gevonden);
    }

    [Fact]
    public async Task Beheer_kunstwerk_event_vult_het_readmodel_idempotent()
    {
        await using var conn = await new ConnectionFactory { Uri = new Uri(fixture.AmqpUrl) }.CreateConnectionAsync();
        await using var ch = await conn.CreateChannelAsync();
        await ch.ExchangeDeclareAsync("rws.events", ExchangeType.Topic, durable: true);

        const string envelope = """{"eventId":"it-e1","eventType":"beheer.kunstwerk.geregistreerd","occurredAt":"2026-07-01T09:00:00.000Z","producer":"beheer","version":1,"data":{"kunstwerkId":"KW-C","type":"brug","locatie":"A2"}}""";
        var body = Encoding.UTF8.GetBytes(envelope);
        var props = new BasicProperties();
        await ch.BasicPublishAsync("rws.events", "beheer.kunstwerk.geregistreerd", mandatory: false, props, body);
        await ch.BasicPublishAsync("rws.events", "beheer.kunstwerk.geregistreerd", mandatory: false, props, body); // dubbel

        var aantal = 0;
        for (var i = 0; i < 40; i++)
        {
            using var scope = fixture.Factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<MonitoringDbContext>();
            aantal = await db.BekendeKunstwerken.CountAsync(k => k.KunstwerkId == "KW-C");
            if (aantal > 0) break;
            await Task.Delay(500);
        }
        Assert.Equal(1, aantal); // ondanks dubbele publicatie precies één rij (idempotent op eventId)
    }
}
```

- [ ] **Step 4: Run de integratietests**

Zorg dat Docker draait. Run: `dotnet test test/Monitoring.IntegrationTests`
Expected: 3 tests PASS (kan 30-60s duren; Testcontainers trekt de images de eerste keer).

- [ ] **Step 5: Volledige suite + commit**

Run: `dotnet test` (alle unit- + integratietests groen).
```bash
git add monitoring/
git commit -m "test(monitoring): Testcontainers-integratietests (HTTP, outbox-doorstroom, consumer-idempotentie)"
```

---

## Self-review (dekking t.o.v. de spec)

- **Lagen/afhankelijkheidsregel** → Task 1 (projectgraaf, compile-afgedwongen). **Config/health** → Task 1–3, 18. **Domein** (value objects, aggregates, AnalyseService, rapport) → Task 4–8. **Use cases + ports + posture** → Task 9–12. **EF-persistence + mappers + read-model** → Task 13–14. **Envelope + outbox + relay** → Task 15. **RabbitMQ + idempotente consumer** → Task 16. **REST/OpenAPI/Scalar** → Task 17–18. **Streng validatie** → Task 9/10 (`ValidatiePosture`) + Task 18 (uit config). **Netwerkrapportage-event** → Task 12 + 19. **Outbox transactioneel** → Task 15. **Docker/compose** → Task 19. **Testcontainers-integratietests** → Task 20. Alle 4 gepubliceerde events + het netwerkrapportage-event, en de `beheer.kunstwerk.*`-consumer, zijn gedekt.
- **Type-consistentie:** de "Interfaces/Produces"-blokken gebruiken overal dezelfde namen (`UitvoerenAsync`, `TrekEventsLeeg`, `IBerichtKanaal`, `IOutboxStore`, `Kunstwerkbewaking.BewaakAsync`, `SessieMapper/…`). `MonitoringRapport.Herstel` wordt in Task 13 toegevoegd vóór gebruik in Task 14.
- **Bewuste vereenvoudigingen (genoteerd):** outbox = same-DB best-effort atomiciteit (geen single-transaction UoW), on-demand rapportage (geen scheduler), geen persistentie van de netwerkrapportage. Consistent met de Contract-service.

## Execution Handoff

Plan opgeslagen in `docs/superpowers/plans/2026-07-02-monitoring-service-dotnet.md`. De gebruiker heeft gevraagd om na dit plan **direct te bouwen** op branch `monitoring-service`.












