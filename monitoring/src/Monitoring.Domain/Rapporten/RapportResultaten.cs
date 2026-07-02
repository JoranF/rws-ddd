namespace Monitoring.Domain.Rapporten;

public sealed record SensorSamenvatting(string SensorType, int Aantal, double Min, double Max, double Gemiddelde);

public sealed record RapportResultaten(
    IReadOnlyList<SensorSamenvatting> PerSensor,
    int TotaalIncidenten,
    int OpenIncidenten,
    int OpgelosteIncidenten,
    IReadOnlyList<string> IncidentIds);
