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
