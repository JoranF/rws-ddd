using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Incidenten;
using Monitoring.Domain.Rapporten;
using Monitoring.Domain.Sessies;
using Xunit;

namespace Monitoring.UnitTests.Domein;

public class MonitoringRapportTests
{
    private static Meting Meting(double waarde, SensorType type = SensorType.Trilling) =>
        new(MetingId.Van($"M{waarde}"), SessieId.Van("S1"), KunstwerkReferentie.Van("KW1"),
            SensorData.Van(type, waarde), new DateTime(2026, 7, 1, 9, 0, 0, DateTimeKind.Utc));

    private static Incident Incident(string id, Ernst ernst, bool opgelost)
    {
        var i = Monitoring.Domain.Incidenten.Incident.MaakAan(IncidentId.Van(id), KunstwerkReferentie.Van("KW1"),
            Afwijking.Van(SensorType.Trilling, 7.5, 5, ernst, new DateTime(2026, 7, 1, 9, 0, 0, DateTimeKind.Utc)));
        if (opgelost) i.LosOp(DateTime.UtcNow);
        return i;
    }

    [Fact]
    public void Berekent_samenvattingen_kiest_zwaarste_open_incident_en_registreert_het_event()
    {
        var metingen = new List<Meting> { Meting(2), Meting(4), Meting(6) };
        var incidenten = new List<Incident>
        {
            Incident("I-laag", Ernst.Laag, opgelost: false),
            Incident("I-hoog", Ernst.Hoog, opgelost: false),
            Incident("I-op", Ernst.Kritiek, opgelost: true),
        };

        var rapport = MonitoringRapport.StelOp(
            RapportId.Van("R1"), KunstwerkReferentie.Van("KW1"),
            new DateTime(2026, 7, 1, 0, 0, 0, DateTimeKind.Utc), new DateTime(2026, 7, 2, 0, 0, 0, DateTimeKind.Utc),
            metingen, incidenten, new DateTime(2026, 7, 2, 12, 0, 0, DateTimeKind.Utc));

        var trilling = Assert.Single(rapport.Resultaten.PerSensor);
        Assert.Equal(3, trilling.Aantal);
        Assert.Equal(2, trilling.Min);
        Assert.Equal(6, trilling.Max);
        Assert.Equal(4, trilling.Gemiddelde);

        Assert.Equal(3, rapport.Resultaten.TotaalIncidenten);
        Assert.Equal(2, rapport.Resultaten.OpenIncidenten);
        Assert.Equal(1, rapport.Resultaten.OpgelosteIncidenten);
        Assert.Equal("I-hoog", rapport.ZwaarsteOpenIncident!.Waarde); // zwaarste van de OPEN incidenten

        var events = rapport.TrekEventsLeeg();
        Assert.Equal("monitoring.rapport.opgesteld", events[0].EventType);
        Assert.Equal("I-hoog", events[0].Data["incidentId"]);
    }

    [Fact]
    public void ZwaarsteOpenIncident_is_null_zonder_open_incidenten()
    {
        var rapport = MonitoringRapport.StelOp(
            RapportId.Van("R2"), KunstwerkReferentie.Van("KW1"),
            new DateTime(2026, 7, 1, 0, 0, 0, DateTimeKind.Utc), new DateTime(2026, 7, 2, 0, 0, 0, DateTimeKind.Utc),
            new List<Meting>(), new List<Incident>(), new DateTime(2026, 7, 2, 12, 0, 0, DateTimeKind.Utc));
        Assert.Null(rapport.ZwaarsteOpenIncident);
        Assert.Empty(rapport.Resultaten.PerSensor);
    }
}
