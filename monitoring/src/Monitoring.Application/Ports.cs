using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Incidenten;
using Monitoring.Domain.Rapporten;
using Monitoring.Domain.Sessies;

namespace Monitoring.Application;

public interface IMonitoringSessieRepository
{
    Task BewaarAsync(MonitoringSessie sessie);
    Task<MonitoringSessie?> ZoekAsync(SessieId id);
    Task<IReadOnlyList<MonitoringSessie>> ZoekAlleAsync();
    Task<MonitoringSessie?> ZoekLopendeVoorKunstwerkAsync(KunstwerkReferentie kunstwerkId);
}

public interface IMetingRepository
{
    Task VoegToeAsync(Meting meting);
    Task<IReadOnlyList<Meting>> ZoekAsync(KunstwerkReferentie kunstwerkId, SensorType? sensorType);
    Task<IReadOnlyList<Meting>> ZoekInPeriodeAsync(KunstwerkReferentie kunstwerkId, DateTime start, DateTime eind);
}

public interface IIncidentRepository
{
    Task BewaarAsync(Incident incident);
    Task<Incident?> ZoekAsync(IncidentId id);
    Task<IReadOnlyList<Incident>> ZoekAsync(IncidentStatus? status, KunstwerkReferentie? kunstwerkId);
    Task<IReadOnlyList<Incident>> ZoekInPeriodeAsync(KunstwerkReferentie kunstwerkId, DateTime start, DateTime eind);
}

public interface IRapportRepository
{
    Task BewaarAsync(MonitoringRapport rapport);
    Task<MonitoringRapport?> ZoekAsync(RapportId id);
    Task<IReadOnlyList<MonitoringRapport>> ZoekAsync(KunstwerkReferentie? kunstwerkId);
}

public interface IEventPublisher
{
    Task PubliceerAsync(IReadOnlyList<IDomainEvent> events);
}

public interface IKunstwerkenReadModel
{
    Task<bool> IsBekendEnInGebruikAsync(KunstwerkReferentie kunstwerkId);
    Task<IReadOnlyList<KunstwerkReferentie>> AlleInGebruikAsync();
}

public interface IIdGenerator
{
    string Nieuw();
}

public interface IKlok
{
    DateTime Nu();
}
