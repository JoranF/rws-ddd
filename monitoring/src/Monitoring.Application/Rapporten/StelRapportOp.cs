using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Rapporten;

namespace Monitoring.Application.Rapporten;

public sealed record StelRapportOpCommand(string KunstwerkId, DateTime PeriodeStart, DateTime PeriodeEind);

public sealed class StelRapportOp(
    IMetingRepository metingen,
    IIncidentRepository incidenten,
    IRapportRepository rapporten,
    IEventPublisher publisher,
    IIdGenerator ids,
    IKlok klok)
{
    public async Task<string> UitvoerenAsync(StelRapportOpCommand command)
    {
        var kunstwerkId = KunstwerkReferentie.Van(command.KunstwerkId);
        var m = await metingen.ZoekInPeriodeAsync(kunstwerkId, command.PeriodeStart, command.PeriodeEind);
        var i = await incidenten.ZoekInPeriodeAsync(kunstwerkId, command.PeriodeStart, command.PeriodeEind);

        var rapport = MonitoringRapport.StelOp(RapportId.Van(ids.Nieuw()), kunstwerkId,
            command.PeriodeStart, command.PeriodeEind, m, i, klok.Nu());
        await rapporten.BewaarAsync(rapport);
        await publisher.PubliceerAsync(rapport.TrekEventsLeeg());
        return rapport.Id.Waarde;
    }
}
