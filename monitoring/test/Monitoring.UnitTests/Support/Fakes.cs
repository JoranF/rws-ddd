using Monitoring.Application;
using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Incidenten;
using Monitoring.Domain.Rapporten;
using Monitoring.Domain.Sessies;

namespace Monitoring.UnitTests.Support;

public sealed class InMemorySessieRepository : IMonitoringSessieRepository
{
    private readonly Dictionary<string, MonitoringSessie> _opslag = new();
    public Task BewaarAsync(MonitoringSessie sessie) { _opslag[sessie.Id.Waarde] = sessie; return Task.CompletedTask; }
    public Task<MonitoringSessie?> ZoekAsync(SessieId id) => Task.FromResult(_opslag.GetValueOrDefault(id.Waarde));
    public Task<IReadOnlyList<MonitoringSessie>> ZoekAlleAsync() => Task.FromResult<IReadOnlyList<MonitoringSessie>>(_opslag.Values.ToList());
    public Task<MonitoringSessie?> ZoekLopendeVoorKunstwerkAsync(KunstwerkReferentie kunstwerkId) =>
        Task.FromResult(_opslag.Values.FirstOrDefault(s => s.KunstwerkId == kunstwerkId && s.Status != MonitoringStatus.Afgerond));
}

public sealed class InMemoryMetingRepository : IMetingRepository
{
    public List<Meting> Metingen { get; } = new();
    public Task VoegToeAsync(Meting meting) { Metingen.Add(meting); return Task.CompletedTask; }
    public Task<IReadOnlyList<Meting>> ZoekAsync(KunstwerkReferentie kunstwerkId, SensorType? sensorType) =>
        Task.FromResult<IReadOnlyList<Meting>>(Metingen
            .Where(m => m.KunstwerkId == kunstwerkId && (sensorType is null || m.SensorData.SensorType == sensorType))
            .ToList());
    public Task<IReadOnlyList<Meting>> ZoekInPeriodeAsync(KunstwerkReferentie kunstwerkId, DateTime start, DateTime eind) =>
        Task.FromResult<IReadOnlyList<Meting>>(Metingen
            .Where(m => m.KunstwerkId == kunstwerkId && m.Tijdstip >= start && m.Tijdstip <= eind)
            .ToList());
}

public sealed class InMemoryIncidentRepository : IIncidentRepository
{
    private readonly Dictionary<string, Incident> _opslag = new();
    public Task BewaarAsync(Incident incident) { _opslag[incident.Id.Waarde] = incident; return Task.CompletedTask; }
    public Task<Incident?> ZoekAsync(IncidentId id) => Task.FromResult(_opslag.GetValueOrDefault(id.Waarde));
    public Task<IReadOnlyList<Incident>> ZoekAsync(IncidentStatus? status, KunstwerkReferentie? kunstwerkId) =>
        Task.FromResult<IReadOnlyList<Incident>>(_opslag.Values
            .Where(i => (status is null || i.Status == status) && (kunstwerkId is null || i.KunstwerkId == kunstwerkId))
            .ToList());
    public Task<IReadOnlyList<Incident>> ZoekInPeriodeAsync(KunstwerkReferentie kunstwerkId, DateTime start, DateTime eind) =>
        Task.FromResult<IReadOnlyList<Incident>>(_opslag.Values
            .Where(i => i.KunstwerkId == kunstwerkId && i.AangemaaktOp >= start && i.AangemaaktOp <= eind)
            .ToList());
}

public sealed class InMemoryRapportRepository : IRapportRepository
{
    private readonly Dictionary<string, MonitoringRapport> _opslag = new();
    public Task BewaarAsync(MonitoringRapport rapport) { _opslag[rapport.Id.Waarde] = rapport; return Task.CompletedTask; }
    public Task<MonitoringRapport?> ZoekAsync(RapportId id) => Task.FromResult(_opslag.GetValueOrDefault(id.Waarde));
    public Task<IReadOnlyList<MonitoringRapport>> ZoekAsync(KunstwerkReferentie? kunstwerkId) =>
        Task.FromResult<IReadOnlyList<MonitoringRapport>>(_opslag.Values
            .Where(r => kunstwerkId is null || r.KunstwerkId == kunstwerkId).ToList());
}

public sealed class FakeEventPublisher : IEventPublisher
{
    public List<IDomainEvent> Gepubliceerd { get; } = new();
    public Task PubliceerAsync(IReadOnlyList<IDomainEvent> events) { Gepubliceerd.AddRange(events); return Task.CompletedTask; }
    public IEnumerable<string> Types => Gepubliceerd.Select(e => e.EventType);
}

public sealed class FakeKunstwerkenReadModel : IKunstwerkenReadModel
{
    private readonly HashSet<string> _bekend;
    public FakeKunstwerkenReadModel(params string[] bekend) => _bekend = new HashSet<string>(bekend);
    public Task<bool> IsBekendEnInGebruikAsync(KunstwerkReferentie kunstwerkId) => Task.FromResult(_bekend.Contains(kunstwerkId.Waarde));
    public Task<IReadOnlyList<KunstwerkReferentie>> AlleInGebruikAsync() =>
        Task.FromResult<IReadOnlyList<KunstwerkReferentie>>(_bekend.Select(KunstwerkReferentie.Van).ToList());
}

public sealed class VasteIdGenerator : IIdGenerator
{
    private int _teller;
    private readonly string _prefix;
    public VasteIdGenerator(string prefix = "ID") => _prefix = prefix;
    public string Nieuw() => $"{_prefix}-{++_teller}";
}

public sealed class VasteKlok : IKlok
{
    private readonly DateTime _nu;
    public VasteKlok(DateTime nu) => _nu = nu;
    public DateTime Nu() => _nu;
}
