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
