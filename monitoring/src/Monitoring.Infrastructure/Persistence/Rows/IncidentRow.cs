namespace Monitoring.Infrastructure.Persistence.Rows;

public class IncidentRow
{
    public string Id { get; set; } = "";
    public string KunstwerkId { get; set; } = "";
    public string SensorType { get; set; } = "";
    public double GemetenWaarde { get; set; }
    public double Drempelwaarde { get; set; }
    public string Ernst { get; set; } = "";
    public string Omschrijving { get; set; } = "";
    public string Vervolgactie { get; set; } = "";
    public string Status { get; set; } = "";
    public DateTime AangemaaktOp { get; set; }
    public DateTime? OpgelostOp { get; set; }
}
