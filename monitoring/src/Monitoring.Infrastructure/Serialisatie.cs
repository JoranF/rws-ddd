using System.Text.Json;

namespace Monitoring.Infrastructure;

public static class Serialisatie
{
    // Web-defaults = camelCase property policy + case-insensitive lezen. Byte-compatibel met de andere services.
    public static readonly JsonSerializerOptions Opties = new(JsonSerializerDefaults.Web);
}
