using RabbitMQ.Client;

namespace Monitoring.Infrastructure.Messaging;

public sealed class RabbitMqBerichtKanaal(RabbitMqConnectie connectie) : IBerichtKanaal
{
    public async Task PubliceerAsync(string routingKey, ReadOnlyMemory<byte> body)
    {
        var props = new BasicProperties { Persistent = true };
        await connectie.Kanaal.BasicPublishAsync(
            exchange: RabbitMqConnectie.Exchange,
            routingKey: routingKey,
            mandatory: false,
            basicProperties: props,
            body: body);
    }
}
