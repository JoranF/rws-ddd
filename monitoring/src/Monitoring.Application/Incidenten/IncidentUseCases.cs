using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Incidenten;

namespace Monitoring.Application.Incidenten;

public sealed class NeemIncidentInBehandeling(IIncidentRepository incidenten)
{
    public async Task UitvoerenAsync(string incidentId)
    {
        var incident = await incidenten.ZoekAsync(IncidentId.Van(incidentId))
            ?? throw new DomeinFout("incident niet gevonden");
        incident.NeemInBehandeling();
        await incidenten.BewaarAsync(incident);
    }
}

public sealed class LosIncidentOp(IIncidentRepository incidenten, IEventPublisher publisher, IKlok klok)
{
    public async Task UitvoerenAsync(string incidentId)
    {
        var incident = await incidenten.ZoekAsync(IncidentId.Van(incidentId))
            ?? throw new DomeinFout("incident niet gevonden");
        incident.LosOp(klok.Nu());
        await incidenten.BewaarAsync(incident);
        await publisher.PubliceerAsync(incident.TrekEventsLeeg());
    }
}
