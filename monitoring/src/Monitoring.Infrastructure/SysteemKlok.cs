using Monitoring.Application;

namespace Monitoring.Infrastructure;

public sealed class SysteemKlok : IKlok
{
    public DateTime Nu() => DateTime.UtcNow;
}
