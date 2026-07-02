using Monitoring.Application;
using Monitoring.Application.Sessies;
using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Sessies;
using Monitoring.UnitTests.Support;
using Xunit;

namespace Monitoring.UnitTests.Applicatie;

public class SessieUseCasesTests
{
    private readonly InMemorySessieRepository _sessies = new();
    private readonly FakeEventPublisher _publisher = new();
    private readonly VasteKlok _klok = new(new DateTime(2026, 7, 1, 8, 0, 0, DateTimeKind.Utc));

    private StartMonitoringSessie Start(ValidatiePosture posture, params string[] bekend) =>
        new(_sessies, _publisher, new FakeKunstwerkenReadModel(bekend), new VasteIdGenerator("S"), _klok, posture);

    [Fact]
    public async Task Start_maakt_een_actieve_sessie_bij_soepele_validatie_ook_zonder_bekend_kunstwerk()
    {
        var id = await Start(ValidatiePosture.Soepel).UitvoerenAsync(new StartMonitoringSessieCommand("KW1"));
        var sessie = await _sessies.ZoekAsync(SessieId.Van(id));
        Assert.Equal(MonitoringStatus.Actief, sessie!.Status);
    }

    [Fact]
    public async Task Start_weigert_bij_streng_en_onbekend_kunstwerk()
    {
        await Assert.ThrowsAsync<DomeinFout>(() =>
            Start(ValidatiePosture.Streng).UitvoerenAsync(new StartMonitoringSessieCommand("KW1")));
    }

    [Fact]
    public async Task Start_slaagt_bij_streng_en_bekend_kunstwerk()
    {
        var id = await Start(ValidatiePosture.Streng, "KW1").UitvoerenAsync(new StartMonitoringSessieCommand("KW1"));
        Assert.NotNull(await _sessies.ZoekAsync(SessieId.Van(id)));
    }

    [Fact]
    public async Task Start_weigert_een_tweede_lopende_sessie_voor_hetzelfde_kunstwerk()
    {
        await Start(ValidatiePosture.Soepel).UitvoerenAsync(new StartMonitoringSessieCommand("KW1"));
        await Assert.ThrowsAsync<DomeinFout>(() =>
            Start(ValidatiePosture.Soepel).UitvoerenAsync(new StartMonitoringSessieCommand("KW1")));
    }

    [Fact]
    public async Task Pauzeer_hervat_en_rondaf_wijzigen_de_status()
    {
        var id = await Start(ValidatiePosture.Soepel).UitvoerenAsync(new StartMonitoringSessieCommand("KW1"));
        await new PauzeerMonitoringSessie(_sessies).UitvoerenAsync(id);
        Assert.Equal(MonitoringStatus.Gepauzeerd, (await _sessies.ZoekAsync(SessieId.Van(id)))!.Status);
        await new HervatMonitoringSessie(_sessies).UitvoerenAsync(id);
        Assert.Equal(MonitoringStatus.Actief, (await _sessies.ZoekAsync(SessieId.Van(id)))!.Status);
        await new RondMonitoringSessieAf(_sessies, _klok).UitvoerenAsync(id);
        Assert.Equal(MonitoringStatus.Afgerond, (await _sessies.ZoekAsync(SessieId.Van(id)))!.Status);
    }
}
