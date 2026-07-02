using Monitoring.Application;
using Monitoring.Application.Metingen;
using Monitoring.Application.Sessies;
using Monitoring.Domain.Analyse;
using Monitoring.Domain.Gedeeld;
using Monitoring.UnitTests.Support;
using Xunit;

namespace Monitoring.UnitTests.Applicatie;

public class RegistreerMetingTests
{
    private readonly InMemorySessieRepository _sessies = new();
    private readonly InMemoryMetingRepository _metingen = new();
    private readonly InMemoryIncidentRepository _incidenten = new();
    private readonly FakeEventPublisher _publisher = new();
    private readonly VasteKlok _klok = new(new DateTime(2026, 7, 1, 9, 0, 0, DateTimeKind.Utc));

    private async Task StartSessieAsync()
    {
        var start = new StartMonitoringSessie(_sessies, _publisher, new FakeKunstwerkenReadModel("KW1"),
            new VasteIdGenerator("S"), _klok, ValidatiePosture.Soepel);
        await start.UitvoerenAsync(new StartMonitoringSessieCommand("KW1"));
        _publisher.Gepubliceerd.Clear();
    }

    private RegistreerMeting Maak() => new(_sessies, _metingen, _incidenten, _publisher,
        new FakeKunstwerkenReadModel("KW1"), new AnalyseService(), new VasteIdGenerator("M"), _klok, ValidatiePosture.Soepel);

    [Fact]
    public async Task Registreert_een_normale_meting_zonder_incident()
    {
        await StartSessieAsync();
        var resultaat = await Maak().UitvoerenAsync(new RegistreerMetingCommand("KW1", "Trilling", 3.0));
        Assert.Null(resultaat.IncidentId);
        Assert.Single(_metingen.Metingen);
        Assert.Equal(new[] { "monitoring.meting.geregistreerd" }, _publisher.Types);
    }

    [Fact]
    public async Task Maakt_een_incident_bij_een_afwijking_en_publiceert_beide_events()
    {
        await StartSessieAsync();
        var resultaat = await Maak().UitvoerenAsync(new RegistreerMetingCommand("KW1", "Trilling", 10.0)); // f = 2 -> Kritiek
        Assert.NotNull(resultaat.IncidentId);
        Assert.Equal(new[] { "monitoring.meting.geregistreerd", "monitoring.incident.aangemaakt" }, _publisher.Types);
    }

    [Fact]
    public async Task Weigert_meten_zonder_lopende_sessie()
    {
        await Assert.ThrowsAsync<DomeinFout>(() =>
            Maak().UitvoerenAsync(new RegistreerMetingCommand("KW1", "Trilling", 3.0)));
    }

    [Fact]
    public async Task Weigert_een_onbekend_sensortype()
    {
        await StartSessieAsync();
        await Assert.ThrowsAsync<DomeinFout>(() =>
            Maak().UitvoerenAsync(new RegistreerMetingCommand("KW1", "Geluid", 3.0)));
    }
}
