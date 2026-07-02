using RabbitMQ.Client;

namespace Monitoring.Infrastructure.Messaging;

public sealed class RabbitMqConnectie : IAsyncDisposable
{
    public const string Exchange = "rws.events";

    private readonly IConnection _connectie;
    public IChannel Kanaal { get; }

    private RabbitMqConnectie(IConnection connectie, IChannel kanaal)
    {
        _connectie = connectie;
        Kanaal = kanaal;
    }

    public static async Task<RabbitMqConnectie> VerbindAsync(string url)
    {
        var factory = new ConnectionFactory { Uri = new Uri(url) };
        var connectie = await factory.CreateConnectionAsync();
        var kanaal = await connectie.CreateChannelAsync();
        await kanaal.ExchangeDeclareAsync(Exchange, ExchangeType.Topic, durable: true);
        return new RabbitMqConnectie(connectie, kanaal);
    }

    public bool IsVerbonden => _connectie.IsOpen && Kanaal.IsOpen;

    public Task<IChannel> MaakKanaalAsync() => _connectie.CreateChannelAsync();

    public async ValueTask DisposeAsync()
    {
        try { await Kanaal.CloseAsync(); } catch { /* al gesloten */ }
        try { await _connectie.CloseAsync(); } catch { /* al gesloten */ }
        _connectie.Dispose();
    }
}
