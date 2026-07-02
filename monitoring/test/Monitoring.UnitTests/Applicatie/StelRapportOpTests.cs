using Monitoring.Application.Rapporten;
using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Sessies;
using Monitoring.UnitTests.Support;
using Xunit;

namespace Monitoring.UnitTests.Applicatie;

public class StelRapportOpTests
{
    [Fact]
    public async Task Stelt_een_rapport_op_over_de_metingen_in_de_periode_en_publiceert_het_event()
    {
        var metingen = new InMemoryMetingRepository();
        var incidenten = new InMemoryIncidentRepository();
        var rapporten = new InMemoryRapportRepository();
        var publisher = new FakeEventPublisher();
        var klok = new VasteKlok(new DateTime(2026, 7, 2, 12, 0, 0, DateTimeKind.Utc));

        await metingen.VoegToeAsync(new Meting(MetingId.Van("M1"), SessieId.Van("S1"), KunstwerkReferentie.Van("KW1"),
            SensorData.Van(SensorType.Trilling, 4), new DateTime(2026, 7, 1, 9, 0, 0, DateTimeKind.Utc)));

        var useCase = new StelRapportOp(metingen, incidenten, rapporten, publisher, new VasteIdGenerator("R"), klok);
        var id = await useCase.UitvoerenAsync(new StelRapportOpCommand("KW1",
            new DateTime(2026, 7, 1, 0, 0, 0, DateTimeKind.Utc), new DateTime(2026, 7, 2, 0, 0, 0, DateTimeKind.Utc)));

        Assert.NotNull(await rapporten.ZoekAsync(RapportId.Van(id)));
        Assert.Equal(new[] { "monitoring.rapport.opgesteld" }, publisher.Types);
    }
}
