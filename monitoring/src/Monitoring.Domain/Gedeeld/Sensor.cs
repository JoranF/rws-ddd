namespace Monitoring.Domain.Gedeeld;

public enum SensorType
{
    Trilling,
    Belasting,
    Temperatuur,
    Slijtage,
}

public static class Sensoren
{
    public static string StandaardEenheid(this SensorType type) => type switch
    {
        SensorType.Trilling => "mm/s",
        SensorType.Belasting => "kN",
        SensorType.Temperatuur => "°C",
        SensorType.Slijtage => "%",
        _ => throw new DomeinFout("onbekend sensortype"),
    };
}

public sealed record SensorData
{
    public SensorType SensorType { get; }
    public double Waarde { get; }
    public string Eenheid { get; }

    private SensorData(SensorType sensorType, double waarde, string eenheid)
    {
        SensorType = sensorType;
        Waarde = waarde;
        Eenheid = eenheid;
    }

    public static SensorData Van(SensorType sensorType, double waarde)
    {
        if (double.IsNaN(waarde) || double.IsInfinity(waarde))
            throw new DomeinFout("waarde moet een eindig getal zijn");
        if (waarde < 0 && sensorType != SensorType.Temperatuur)
            throw new DomeinFout($"{sensorType} mag niet negatief zijn");
        if (sensorType == SensorType.Slijtage && waarde > 100)
            throw new DomeinFout("slijtage is een percentage (0-100)");
        return new SensorData(sensorType, waarde, sensorType.StandaardEenheid());
    }
}
