namespace Monitoring.Domain.Gedeeld;

public interface IDomainEvent
{
    string EventType { get; }
    IReadOnlyDictionary<string, object?> Data { get; }
}

public sealed record MetingGeregistreerd(
    string MetingId, string SessieId, string KunstwerkId,
    string SensorType, double Waarde, string Eenheid, string Tijdstip) : IDomainEvent
{
    public string EventType => "monitoring.meting.geregistreerd";
    public IReadOnlyDictionary<string, object?> Data => new Dictionary<string, object?>
    {
        ["metingId"] = MetingId,
        ["sessieId"] = SessieId,
        ["kunstwerkId"] = KunstwerkId,
        ["sensorType"] = SensorType,
        ["waarde"] = Waarde,
        ["eenheid"] = Eenheid,
        ["tijdstip"] = Tijdstip,
    };
}

public sealed record IncidentAangemaakt(
    string IncidentId, string KunstwerkId, string Ernst, string Omschrijving,
    string SensorType, string Vervolgactie) : IDomainEvent
{
    public string EventType => "monitoring.incident.aangemaakt";
    public IReadOnlyDictionary<string, object?> Data => new Dictionary<string, object?>
    {
        ["incidentId"] = IncidentId,
        ["kunstwerkId"] = KunstwerkId,
        ["ernst"] = Ernst,
        ["omschrijving"] = Omschrijving,
        ["sensorType"] = SensorType,
        ["vervolgactie"] = Vervolgactie,
    };
}

public sealed record IncidentOpgelost(string IncidentId, string KunstwerkId, string Datum) : IDomainEvent
{
    public string EventType => "monitoring.incident.opgelost";
    public IReadOnlyDictionary<string, object?> Data => new Dictionary<string, object?>
    {
        ["incidentId"] = IncidentId,
        ["kunstwerkId"] = KunstwerkId,
        ["datum"] = Datum,
    };
}

public sealed record RapportOpgesteld(string KunstwerkId, string? IncidentId, object Resultaten) : IDomainEvent
{
    public string EventType => "monitoring.rapport.opgesteld";
    public IReadOnlyDictionary<string, object?> Data => new Dictionary<string, object?>
    {
        ["kunstwerkId"] = KunstwerkId,
        ["incidentId"] = IncidentId,
        ["resultaten"] = Resultaten,
    };
}

public sealed record NetwerkrapportageOpgesteld(string PeriodeStart, string PeriodeEind, string OpgesteldOp, object Kunstwerken) : IDomainEvent
{
    public string EventType => "monitoring.netwerkrapportage.opgesteld";
    public IReadOnlyDictionary<string, object?> Data => new Dictionary<string, object?>
    {
        ["periode"] = new Dictionary<string, object?> { ["start"] = PeriodeStart, ["eind"] = PeriodeEind },
        ["opgesteldOp"] = OpgesteldOp,
        ["kunstwerken"] = Kunstwerken,
    };
}
