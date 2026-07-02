using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Sessies;
using Xunit;

namespace Monitoring.UnitTests.Domein;

public class MonitoringSessieTests
{
    private static MonitoringSessie Nieuwe() => MonitoringSessie.Start(
        SessieId.Van("S1"), KunstwerkReferentie.Van("KW1"), new DateTime(2026, 7, 1, 8, 0, 0, DateTimeKind.Utc));

    [Fact]
    public void Start_als_Actief_met_nul_metingen()
    {
        var sessie = Nieuwe();
        Assert.Equal(MonitoringStatus.Actief, sessie.Status);
        Assert.Equal(0, sessie.AantalMetingen);
    }

    [Fact]
    public void Registreert_een_meting_verhoogt_de_teller_en_registreert_het_event()
    {
        var sessie = Nieuwe();
        var meting = sessie.RegistreerMeting(MetingId.Van("M1"), SensorData.Van(SensorType.Trilling, 3.5),
            new DateTime(2026, 7, 1, 9, 0, 0, DateTimeKind.Utc));

        Assert.Equal("S1", meting.SessieId.Waarde);
        Assert.Equal("KW1", meting.KunstwerkId.Waarde);
        Assert.Equal(1, sessie.AantalMetingen);

        var events = sessie.TrekEventsLeeg();
        Assert.Equal("monitoring.meting.geregistreerd", events[0].EventType);
        Assert.Equal("M1", events[0].Data["metingId"]);
        Assert.Equal(3.5, events[0].Data["waarde"]);
        Assert.Equal("mm/s", events[0].Data["eenheid"]);
    }

    [Fact]
    public void Weigert_meten_bij_een_gepauzeerde_sessie()
    {
        var sessie = Nieuwe();
        sessie.Pauzeer();
        Assert.Throws<DomeinFout>(() =>
            sessie.RegistreerMeting(MetingId.Van("M1"), SensorData.Van(SensorType.Trilling, 1), DateTime.UtcNow));
    }

    [Fact]
    public void Pauzeert_alleen_vanaf_Actief_en_hervat_alleen_vanaf_Gepauzeerd()
    {
        var sessie = Nieuwe();
        Assert.Throws<DomeinFout>(() => sessie.Hervat());
        sessie.Pauzeer();
        Assert.Equal(MonitoringStatus.Gepauzeerd, sessie.Status);
        Assert.Throws<DomeinFout>(() => sessie.Pauzeer());
        sessie.Hervat();
        Assert.Equal(MonitoringStatus.Actief, sessie.Status);
    }

    [Fact]
    public void Rondt_af_ook_vanaf_Gepauzeerd_en_blokkeert_daarna_alles()
    {
        var sessie = Nieuwe();
        sessie.Pauzeer();
        sessie.RondAf(new DateTime(2026, 7, 2, 8, 0, 0, DateTimeKind.Utc));
        Assert.Equal(MonitoringStatus.Afgerond, sessie.Status);
        Assert.Equal(new DateTime(2026, 7, 2, 8, 0, 0, DateTimeKind.Utc), sessie.BeeindigdOp);
        Assert.Throws<DomeinFout>(() => sessie.RondAf(DateTime.UtcNow));
        Assert.Throws<DomeinFout>(() => sessie.Hervat());
    }
}
