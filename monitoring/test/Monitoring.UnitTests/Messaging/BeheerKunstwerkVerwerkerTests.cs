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
        $$$"""{"eventId":"{{{eventId}}}","eventType":"{{{eventType}}}","occurredAt":"2026-07-01T09:00:00.000Z","producer":"beheer","version":1,"data":{"kunstwerkId":"{{{kunstwerkId}}}","type":"brug","locatie":"A2"}}""";

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
