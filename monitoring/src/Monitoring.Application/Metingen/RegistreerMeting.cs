using Monitoring.Domain.Analyse;
using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Incidenten;

namespace Monitoring.Application.Metingen;

public sealed record RegistreerMetingCommand(string KunstwerkId, string SensorType, double Waarde);

public sealed record RegistreerMetingResultaat(string MetingId, string? IncidentId);

public sealed class RegistreerMeting(
    IMonitoringSessieRepository sessies,
    IMetingRepository metingen,
    IIncidentRepository incidenten,
    IEventPublisher publisher,
    IKunstwerkenReadModel kunstwerken,
    AnalyseService analyse,
    IIdGenerator ids,
    IKlok klok,
    ValidatiePosture validatie)
{
    public async Task<RegistreerMetingResultaat> UitvoerenAsync(RegistreerMetingCommand command)
    {
        if (!Enum.TryParse<SensorType>(command.SensorType, ignoreCase: false, out var sensorType))
            throw new DomeinFout($"onbekend sensortype: {command.SensorType}");

        var kunstwerkId = KunstwerkReferentie.Van(command.KunstwerkId);
        await Kunstwerkbewaking.BewaakAsync(kunstwerken, validatie, kunstwerkId);

        var sessie = await sessies.ZoekLopendeVoorKunstwerkAsync(kunstwerkId)
            ?? throw new DomeinFout("geen lopende monitoringsessie voor dit kunstwerk");

        var nu = klok.Nu();
        var sensorData = SensorData.Van(sensorType, command.Waarde);
        var meting = sessie.RegistreerMeting(MetingId.Van(ids.Nieuw()), sensorData, nu);
        await sessies.BewaarAsync(sessie);
        await metingen.VoegToeAsync(meting);

        var teVerzenden = new List<IDomainEvent>(sessie.TrekEventsLeeg());

        string? incidentId = null;
        var afwijking = analyse.Analyseer(sensorData, nu);
        if (afwijking is not null)
        {
            var incident = Incident.MaakAan(IncidentId.Van(ids.Nieuw()), kunstwerkId, afwijking);
            await incidenten.BewaarAsync(incident);
            teVerzenden.AddRange(incident.TrekEventsLeeg());
            incidentId = incident.Id.Waarde;
        }

        await publisher.PubliceerAsync(teVerzenden);
        return new RegistreerMetingResultaat(meting.Id.Waarde, incidentId);
    }
}
