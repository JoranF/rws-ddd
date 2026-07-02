namespace Monitoring.Infrastructure.Messaging;

public interface IBerichtKanaal
{
    Task PubliceerAsync(string routingKey, ReadOnlyMemory<byte> body);
}
