using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Incidenten;
using Xunit;

namespace Monitoring.UnitTests.Domein;

public class IncidentTests
{
    private static Incident Nieuw(Ernst ernst = Ernst.Hoog) => Incident.MaakAan(
        IncidentId.Van("I1"), KunstwerkReferentie.Van("KW1"),
        Afwijking.Van(SensorType.Trilling, 7.5, 5, ernst, new DateTime(2026, 7, 1, 9, 0, 0, DateTimeKind.Utc)));

    [Fact]
    public void Ontstaat_als_Nieuw_met_afgeleide_omschrijving_en_vervolgactie_en_registreert_het_event()
    {
        var incident = Nieuw(Ernst.Hoog);
        Assert.Equal(IncidentStatus.Nieuw, incident.Status);
        Assert.Equal(Vervolgactie.Onderhoud, incident.Vervolgactie);
        Assert.Equal("Trilling van 7.5 mm/s overschrijdt drempel 5 mm/s", incident.Omschrijving);
        var events = incident.TrekEventsLeeg();
        Assert.Equal("monitoring.incident.aangemaakt", events[0].EventType);
        Assert.Equal("I1", events[0].Data["incidentId"]);
        Assert.Equal("Onderhoud", events[0].Data["vervolgactie"]);
    }

    [Theory]
    [InlineData(Ernst.Laag, Vervolgactie.IntensieverMonitoren)]
    [InlineData(Ernst.Middel, Vervolgactie.Inspectie)]
    public void Leidt_de_vervolgactie_af(Ernst ernst, Vervolgactie verwacht)
        => Assert.Equal(verwacht, Nieuw(ernst).Vervolgactie);

    [Fact]
    public void Kan_in_behandeling_genomen_worden_maar_alleen_vanaf_Nieuw()
    {
        var incident = Nieuw();
        incident.NeemInBehandeling();
        Assert.Equal(IncidentStatus.InBehandeling, incident.Status);
        Assert.Throws<DomeinFout>(() => incident.NeemInBehandeling());
    }

    [Fact]
    public void Lost_op_en_registreert_het_event()
    {
        var incident = Nieuw();
        incident.TrekEventsLeeg();
        incident.LosOp(new DateTime(2026, 7, 3, 10, 0, 0, DateTimeKind.Utc));
        Assert.Equal(IncidentStatus.Opgelost, incident.Status);
        var events = incident.TrekEventsLeeg();
        Assert.Equal("monitoring.incident.opgelost", events[0].EventType);
        Assert.Equal("2026-07-03T10:00:00.000Z", events[0].Data["datum"]);
    }

    [Fact]
    public void Is_maar_een_keer_oplosbaar()
    {
        var incident = Nieuw();
        incident.LosOp(DateTime.UtcNow);
        Assert.Throws<DomeinFout>(() => incident.LosOp(DateTime.UtcNow));
        Assert.Throws<DomeinFout>(() => incident.NeemInBehandeling());
    }
}
