using Monitoring.Application;

namespace Monitoring.Infrastructure;

public sealed class UuidIdGenerator : IIdGenerator
{
    public string Nieuw() => Guid.NewGuid().ToString();
}
