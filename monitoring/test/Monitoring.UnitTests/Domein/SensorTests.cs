using Monitoring.Domain.Gedeeld;
using Xunit;

namespace Monitoring.UnitTests.Domein;

public class SensorTests
{
    [Theory]
    [InlineData(SensorType.Trilling, "mm/s")]
    [InlineData(SensorType.Belasting, "kN")]
    [InlineData(SensorType.Temperatuur, "°C")]
    [InlineData(SensorType.Slijtage, "%")]
    public void SensorData_leidt_de_vaste_eenheid_af(SensorType type, string eenheid)
        => Assert.Equal(eenheid, SensorData.Van(type, 1).Eenheid);

    [Fact]
    public void SensorData_weigert_negatief_behalve_temperatuur()
    {
        Assert.Throws<DomeinFout>(() => SensorData.Van(SensorType.Belasting, -1));
        Assert.Equal(-5, SensorData.Van(SensorType.Temperatuur, -5).Waarde);
    }

    [Fact]
    public void SensorData_weigert_slijtage_boven_100()
        => Assert.Throws<DomeinFout>(() => SensorData.Van(SensorType.Slijtage, 101));

    [Theory]
    [InlineData(Ernst.Laag, Vervolgactie.IntensieverMonitoren)]
    [InlineData(Ernst.Middel, Vervolgactie.Inspectie)]
    [InlineData(Ernst.Hoog, Vervolgactie.Onderhoud)]
    [InlineData(Ernst.Kritiek, Vervolgactie.Onderhoud)]
    public void Vervolgactie_wordt_afgeleid_van_de_ernst(Ernst ernst, Vervolgactie verwacht)
        => Assert.Equal(verwacht, Vervolgacties.Voor(ernst));

    [Fact]
    public void Afwijking_weigert_een_waarde_onder_de_drempel()
        => Assert.Throws<DomeinFout>(() => Afwijking.Van(SensorType.Trilling, 3, 5, Ernst.Laag, DateTime.UtcNow));

    [Fact]
    public void Afwijking_beschrijft_zichzelf_met_waarde_drempel_en_eenheid()
    {
        var afwijking = Afwijking.Van(SensorType.Trilling, 7.5, 5, Ernst.Middel, DateTime.UtcNow);
        Assert.Equal("Trilling van 7.5 mm/s overschrijdt drempel 5 mm/s", afwijking.Omschrijving);
    }
}
