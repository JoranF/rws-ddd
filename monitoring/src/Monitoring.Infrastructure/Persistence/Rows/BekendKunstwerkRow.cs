namespace Monitoring.Infrastructure.Persistence.Rows;

public class BekendKunstwerkRow
{
    public string KunstwerkId { get; set; } = "";
    public string? Type { get; set; }
    public string? Locatie { get; set; }
    public bool InGebruik { get; set; } = true;
    public DateTime BijgewerktOp { get; set; }
}
