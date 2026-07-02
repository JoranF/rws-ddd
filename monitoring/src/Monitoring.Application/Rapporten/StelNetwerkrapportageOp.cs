using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Rapporten;

namespace Monitoring.Application.Rapporten;

public sealed record StelNetwerkrapportageOpCommand(DateTime PeriodeStart, DateTime PeriodeEind);

public sealed class StelNetwerkrapportageOp(
    IKunstwerkenReadModel kunstwerken,
    IMetingRepository metingen,
    IIncidentRepository incidenten,
    IEventPublisher publisher,
    IIdGenerator ids,
    IKlok klok)
{
    public async Task<string> UitvoerenAsync(StelNetwerkrapportageOpCommand command)
    {
        var samenvattingen = new List<KunstwerkSamenvatting>();
        foreach (var kunstwerkId in await kunstwerken.AlleInGebruikAsync())
        {
            var m = await metingen.ZoekInPeriodeAsync(kunstwerkId, command.PeriodeStart, command.PeriodeEind);
            var i = await incidenten.ZoekInPeriodeAsync(kunstwerkId, command.PeriodeStart, command.PeriodeEind);
            var zwaarste = i.Count == 0 ? null : i.OrderByDescending(x => x.Ernst.Orde()).First().Ernst.ToString();
            samenvattingen.Add(new KunstwerkSamenvatting(kunstwerkId.Waarde, m.Count, i.Count, zwaarste));
        }

        var rapportage = Netwerkrapportage.StelOp(RapportId.Van(ids.Nieuw()),
            command.PeriodeStart, command.PeriodeEind, samenvattingen, klok.Nu());
        await publisher.PubliceerAsync(rapportage.TrekEventsLeeg());
        return rapportage.Id.Waarde;
    }
}
