using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Incidenten;
using Monitoring.Domain.Rapporten;
using Monitoring.Domain.Sessies;
using Monitoring.Infrastructure.Persistence;
using Xunit;

namespace Monitoring.UnitTests.Persistence;

public class MappersTests
{
    private static readonly DateTime T = new(2026, 7, 1, 9, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Sessie_roundtrip_behoudt_de_kernvelden()
    {
        var sessie = MonitoringSessie.Herstel(SessieId.Van("S1"), KunstwerkReferentie.Van("KW1"),
            MonitoringStatus.Gepauzeerd, T, null, 3);
        var terug = SessieMapper.NaarDomein(SessieMapper.NaarRow(sessie));
        Assert.Equal("S1", terug.Id.Waarde);
        Assert.Equal(MonitoringStatus.Gepauzeerd, terug.Status);
        Assert.Equal(3, terug.AantalMetingen);
    }

    [Fact]
    public void Meting_roundtrip_behoudt_de_sensordata()
    {
        var meting = new Meting(MetingId.Van("M1"), SessieId.Van("S1"), KunstwerkReferentie.Van("KW1"),
            SensorData.Van(SensorType.Belasting, 120), T);
        var terug = MetingMapper.NaarDomein(MetingMapper.NaarRow(meting));
        Assert.Equal(SensorType.Belasting, terug.SensorData.SensorType);
        Assert.Equal(120, terug.SensorData.Waarde);
        Assert.Equal("kN", terug.SensorData.Eenheid);
    }

    [Fact]
    public void Incident_roundtrip_behoudt_status_en_ernst()
    {
        var incident = Incident.MaakAan(IncidentId.Van("I1"), KunstwerkReferentie.Van("KW1"),
            Afwijking.Van(SensorType.Trilling, 7.5, 5, Ernst.Hoog, T));
        var terug = IncidentMapper.NaarDomein(IncidentMapper.NaarRow(incident));
        Assert.Equal(Ernst.Hoog, terug.Ernst);
        Assert.Equal(Vervolgactie.Onderhoud, terug.Vervolgactie);
        Assert.Equal(IncidentStatus.Nieuw, terug.Status);
    }

    [Fact]
    public void Rapport_roundtrip_behoudt_resultaten_via_jsonb()
    {
        var rapport = MonitoringRapport.StelOp(RapportId.Van("R1"), KunstwerkReferentie.Van("KW1"),
            T, T.AddDays(1),
            new List<Meting> { new(MetingId.Van("M1"), SessieId.Van("S1"), KunstwerkReferentie.Van("KW1"), SensorData.Van(SensorType.Trilling, 4), T) },
            new List<Incident>(), T.AddDays(1));
        var terug = RapportMapper.NaarDomein(RapportMapper.NaarRow(rapport));
        Assert.Single(terug.Resultaten.PerSensor);
        Assert.Equal("Trilling", terug.Resultaten.PerSensor[0].SensorType);
        Assert.Equal(4, terug.Resultaten.PerSensor[0].Gemiddelde);
    }
}
