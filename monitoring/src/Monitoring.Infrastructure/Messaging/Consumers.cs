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
