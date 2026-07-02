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
