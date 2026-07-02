using System.Text.Json;
using System.Text.Json.Serialization;

namespace Monitoring.Api;

/// <summary>
/// Normaliseert binnenkomende tijdstippen naar UTC. Npgsql accepteert alleen
/// Kind=Utc voor 'timestamp with time zone'; clients mogen een offset meesturen.
/// </summary>
public sealed class UtcDateTimeConverter : JsonConverter<DateTime>
{
    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var tijd = reader.GetDateTime();
        return tijd.Kind switch
        {
            DateTimeKind.Utc => tijd,
            DateTimeKind.Local => tijd.ToUniversalTime(),
            _ => DateTime.SpecifyKind(tijd, DateTimeKind.Utc),
        };
    }

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options) =>
        writer.WriteStringValue(value.ToUniversalTime());
}
