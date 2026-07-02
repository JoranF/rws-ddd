namespace Monitoring.Infrastructure.Persistence.Rows;

public class MetingRow
{
    public string Id { get; set; } = "";
    public string SessieId { get; set; } = "";
    public string KunstwerkId { get; set; } = "";
    public string SensorType { get; set; } = "";
    public double Waarde { get; set; }
    public string Eenheid { get; set; } = "";
    public DateTime Tijdstip { get; set; }
}
