using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Sessies;

namespace Monitoring.Application.Sessies;

public sealed record StartMonitoringSessieCommand(string KunstwerkId);

public sealed class StartMonitoringSessie(
    IMonitoringSessieRepository sessies,
    IEventPublisher publisher,
    IKunstwerkenReadModel kunstwerken,
    IIdGenerator ids,
    IKlok klok,
    ValidatiePosture validatie)
{
    public async Task<string> UitvoerenAsync(StartMonitoringSessieCommand command)
    {
        var kunstwerkId = KunstwerkReferentie.Van(command.KunstwerkId);
        await Kunstwerkbewaking.BewaakAsync(kunstwerken, validatie, kunstwerkId);

        if (await sessies.ZoekLopendeVoorKunstwerkAsync(kunstwerkId) is not null)
            throw new DomeinFout("er loopt al een monitoringsessie voor dit kunstwerk");

        var sessie = MonitoringSessie.Start(SessieId.Van(ids.Nieuw()), kunstwerkId, klok.Nu());
        await sessies.BewaarAsync(sessie);
        await publisher.PubliceerAsync(sessie.TrekEventsLeeg());
        return sessie.Id.Waarde;
    }
}
