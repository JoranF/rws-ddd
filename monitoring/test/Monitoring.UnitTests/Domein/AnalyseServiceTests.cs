using Monitoring.Domain.Analyse;
using Monitoring.Domain.Gedeeld;
using Xunit;

namespace Monitoring.UnitTests.Domein;

public class AnalyseServiceTests
{
    private static readonly AnalyseService Analyse = new();
    private static readonly DateTime Tijdstip = new(2026, 7, 1, 9, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Geeft_null_onder_de_drempel()
        => Assert.Null(Analyse.Analyseer(SensorData.Van(SensorType.Trilling, 4.9), Tijdstip));

    [Theory]
    [InlineData(5, Ernst.Laag)]      // f = 1
    [InlineData(6.25, Ernst.Middel)] // f = 1.25
    [InlineData(7.5, Ernst.Hoog)]    // f = 1.5
    [InlineData(10, Ernst.Kritiek)]  // f = 2
    public void Leidt_de_ernst_af_van_de_overschrijdingsfactor(double waarde, Ernst verwacht)
        => Assert.Equal(verwacht, Analyse.Analyseer(SensorData.Van(SensorType.Trilling, waarde), Tijdstip)!.Ernst);

    [Fact]
    public void Gebruikt_de_drempel_per_sensortype()
    {
        Assert.Null(Analyse.Analyseer(SensorData.Van(SensorType.Belasting, 99), Tijdstip));
        Assert.Equal(40, Analyse.Analyseer(SensorData.Van(SensorType.Temperatuur, 41), Tijdstip)!.Drempelwaarde);
        Assert.Equal(60, Analyse.Analyseer(SensorData.Van(SensorType.Slijtage, 61), Tijdstip)!.Drempelwaarde);
    }

    [Fact]
    public void Accepteert_aangepaste_drempels()
    {
        var strenger = new AnalyseService(new Dictionary<SensorType, double>
        {
            [SensorType.Trilling] = 2, [SensorType.Belasting] = 100, [SensorType.Temperatuur] = 40, [SensorType.Slijtage] = 60,
        });
        Assert.Equal(Ernst.Kritiek, strenger.Analyseer(SensorData.Van(SensorType.Trilling, 4), Tijdstip)!.Ernst); // f = 2
    }
}
