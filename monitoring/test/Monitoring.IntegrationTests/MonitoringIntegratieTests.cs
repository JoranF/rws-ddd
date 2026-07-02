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
