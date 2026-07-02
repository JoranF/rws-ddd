namespace Monitoring.Infrastructure.Persistence.Rows;

public class MonitoringSessieRow
{
    public string Id { get; set; } = "";
    public string KunstwerkId { get; set; } = "";
    public string Status { get; set; } = "";
    public DateTime GestartOp { get; set; }
    public DateTime? BeeindigdOp { get; set; }
    public int AantalMetingen { get; set; }
}
