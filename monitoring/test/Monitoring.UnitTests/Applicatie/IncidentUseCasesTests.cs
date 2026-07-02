using Monitoring.Application.Incidenten;
using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Incidenten;
using Monitoring.UnitTests.Support;
using Xunit;

namespace Monitoring.UnitTests.Applicatie;

public class IncidentUseCasesTests
{
    private readonly InMemoryIncidentRepository _incidenten = new();
    private readonly FakeEventPublisher _publisher = new();
    private readonly VasteKlok _klok = new(new DateTime(2026, 7, 3, 10, 0, 0, DateTimeKind.Utc));

    private async Task<string> GegevenNieuwIncidentAsync()
    {
        var incident = Incident.MaakAan(IncidentId.Van("I1"), KunstwerkReferentie.Van("KW1"),
            Afwijking.Van(SensorType.Trilling, 7.5, 5, Ernst.Hoog, new DateTime(2026, 7, 1, 9, 0, 0, DateTimeKind.Utc)));
        incident.TrekEventsLeeg();
        await _incidenten.BewaarAsync(incident);
        return "I1";
    }

    [Fact]
    public async Task Neemt_incident_in_behandeling()
    {
        var id = await GegevenNieuwIncidentAsync();
        await new NeemIncidentInBehandeling(_incidenten).UitvoerenAsync(id);
        Assert.Equal(IncidentStatus.InBehandeling, (await _incidenten.ZoekAsync(IncidentId.Van(id)))!.Status);
    }

    [Fact]
    public async Task Lost_incident_op_en_publiceert_het_event()
    {
        var id = await GegevenNieuwIncidentAsync();
        await new LosIncidentOp(_incidenten, _publisher, _klok).UitvoerenAsync(id);
        Assert.Equal(IncidentStatus.Opgelost, (await _incidenten.ZoekAsync(IncidentId.Van(id)))!.Status);
        Assert.Equal(new[] { "monitoring.incident.opgelost" }, _publisher.Types);
    }
}
