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
