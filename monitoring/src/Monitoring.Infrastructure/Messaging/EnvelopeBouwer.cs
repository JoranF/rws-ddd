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
