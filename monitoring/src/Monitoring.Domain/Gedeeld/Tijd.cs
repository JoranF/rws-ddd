using System.Globalization;

namespace Monitoring.Domain.Gedeeld;

public static class Tijd
{
    public static string NaarIso(this DateTime moment) =>
        moment.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
