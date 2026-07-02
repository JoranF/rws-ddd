using Monitoring.Application.Rapporten;
using Monitoring.Domain.Gedeeld;
using Monitoring.UnitTests.Support;
using Xunit;

namespace Monitoring.UnitTests.Applicatie;

public class StelNetwerkrapportageOpTests
{
    [Fact]
    public async Task Vat_per_kunstwerk_samen_en_publiceert_het_netwerkrapportage_event()
    {
        var metingen = new InMemoryMetingRepository();
        var incidenten = new InMemoryIncidentRepository();
        var publisher = new FakeEventPublisher();
        var klok = new VasteKlok(new DateTime(2026, 7, 2, 12, 0, 0, DateTimeKind.Utc));
        var kunstwerken = new FakeKunstwerkenReadModel("KW1", "KW2");

        await metingen.VoegToeAsync(new Domain.Sessies.Meting(MetingId.Van("M1"), SessieId.Van("S1"),
            KunstwerkReferentie.Van("KW1"), SensorData.Van(SensorType.Trilling, 4),
            new DateTime(2026, 7, 1, 9, 0, 0, DateTimeKind.Utc)));

        var useCase = new StelNetwerkrapportageOp(kunstwerken, metingen, incidenten, publisher, new VasteIdGenerator("N"), klok);
        var id = await useCase.UitvoerenAsync(new StelNetwerkrapportageOpCommand(
            new DateTime(2026, 7, 1, 0, 0, 0, DateTimeKind.Utc), new DateTime(2026, 7, 2, 0, 0, 0, DateTimeKind.Utc)));

        Assert.NotNull(id);
        Assert.Equal(new[] { "monitoring.netwerkrapportage.opgesteld" }, publisher.Types);
    }
}
