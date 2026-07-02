namespace Monitoring.Infrastructure.Persistence.Rows;

public class OutboxMessageRow
{
    public string Id { get; set; } = "";          // = eventId uit de envelope
    public string EventType { get; set; } = "";
    public string RoutingKey { get; set; } = "";
    public string Payload { get; set; } = "";      // volledige envelope-JSON (jsonb)
    public bool Gepubliceerd { get; set; }
    public DateTime AangemaaktOp { get; set; }
    public DateTime? GepubliceerdOp { get; set; }
}
