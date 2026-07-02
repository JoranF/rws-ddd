using System.Globalization;

namespace Monitoring.Domain.Gedeeld;

public sealed record Afwijking
{
    public SensorType SensorType { get; }
    public double GemetenWaarde { get; }
    public double Drempelwaarde { get; }
    public Ernst Ernst { get; }
    public DateTime Tijdstip { get; }

    private Afwijking(SensorType sensorType, double gemetenWaarde, double drempelwaarde, Ernst ernst, DateTime tijdstip)
    {
        SensorType = sensorType;
        GemetenWaarde = gemetenWaarde;
        Drempelwaarde = drempelwaarde;
        Ernst = ernst;
        Tijdstip = tijdstip;
    }

    public static Afwijking Van(SensorType sensorType, double gemetenWaarde, double drempelwaarde, Ernst ernst, DateTime tijdstip)
    {
        if (gemetenWaarde < drempelwaarde)
            throw new DomeinFout("een afwijking vereist een waarde op of boven de drempel");
        return new Afwijking(sensorType, gemetenWaarde, drempelwaarde, ernst, tijdstip);
    }

    public string Omschrijving
    {
        get
        {
            var eenheid = SensorType.StandaardEenheid();
            return $"{SensorType} van {Getal(GemetenWaarde)} {eenheid} overschrijdt drempel {Getal(Drempelwaarde)} {eenheid}";
        }
    }

    private static string Getal(double d) => d.ToString(CultureInfo.InvariantCulture);
}
