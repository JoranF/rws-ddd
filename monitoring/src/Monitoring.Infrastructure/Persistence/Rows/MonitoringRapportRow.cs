namespace Monitoring.Infrastructure.Persistence.Rows;

public class MonitoringRapportRow
{
    public string Id { get; set; } = "";
    public string KunstwerkId { get; set; } = "";
    public DateTime PeriodeStart { get; set; }
    public DateTime PeriodeEind { get; set; }
    public string? ZwaarsteOpenIncidentId { get; set; }
    public string Resultaten { get; set; } = "";  // jsonb: geserialiseerde RapportResultaten
    public DateTime OpgesteldOp { get; set; }
}
