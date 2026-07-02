using Monitoring.Domain.Gedeeld;

namespace Monitoring.Domain.Analyse;

public sealed class AnalyseService
{
    public static readonly IReadOnlyDictionary<SensorType, double> StandaardDrempels = new Dictionary<SensorType, double>
    {
        [SensorType.Trilling] = 5,    // mm/s
        [SensorType.Belasting] = 100, // kN
        [SensorType.Temperatuur] = 40, // °C
        [SensorType.Slijtage] = 60,   // %
    };

    private readonly IReadOnlyDictionary<SensorType, double> _drempels;

    public AnalyseService(IReadOnlyDictionary<SensorType, double>? drempels = null) =>
        _drempels = drempels ?? StandaardDrempels;

    public Afwijking? Analyseer(SensorData sensorData, DateTime tijdstip)
    {
        var drempel = _drempels[sensorData.SensorType];
        var factor = sensorData.Waarde / drempel;
        if (factor < 1) return null;
        var ernst = factor < 1.25 ? Ernst.Laag
            : factor < 1.5 ? Ernst.Middel
            : factor < 2 ? Ernst.Hoog
            : Ernst.Kritiek;
        return Afwijking.Van(sensorData.SensorType, sensorData.Waarde, drempel, ernst, tijdstip);
    }
}
