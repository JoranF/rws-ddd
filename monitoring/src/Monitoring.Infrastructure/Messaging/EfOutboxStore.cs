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
