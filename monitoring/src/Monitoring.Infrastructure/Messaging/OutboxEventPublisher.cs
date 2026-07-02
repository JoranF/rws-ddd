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
