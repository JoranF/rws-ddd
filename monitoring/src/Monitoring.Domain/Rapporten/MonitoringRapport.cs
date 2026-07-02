using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Incidenten;
using Monitoring.Domain.Sessies;

namespace Monitoring.Domain.Rapporten;

public sealed class MonitoringRapport : AggregateRoot
{
    public RapportId Id { get; }
    public KunstwerkReferentie KunstwerkId { get; }
    public DateTime PeriodeStart { get; }
    public DateTime PeriodeEind { get; }
    public IncidentId? ZwaarsteOpenIncident { get; }
    public RapportResultaten Resultaten { get; }
    public DateTime OpgesteldOp { get; }

    private MonitoringRapport(RapportId id, KunstwerkReferentie kunstwerkId, DateTime periodeStart, DateTime periodeEind,
        IncidentId? zwaarsteOpenIncident, RapportResultaten resultaten, DateTime opgesteldOp)
    {
        Id = id;
        KunstwerkId = kunstwerkId;
        PeriodeStart = periodeStart;
        PeriodeEind = periodeEind;
        ZwaarsteOpenIncident = zwaarsteOpenIncident;
        Resultaten = resultaten;
        OpgesteldOp = opgesteldOp;
    }

    public static MonitoringRapport StelOp(RapportId id, KunstwerkReferentie kunstwerkId, DateTime periodeStart,
        DateTime periodeEind, IReadOnlyList<Meting> metingen, IReadOnlyList<Incident> incidenten, DateTime opgesteldOp)
    {
        var perSensor = metingen
            .GroupBy(m => m.SensorData.SensorType)
            .OrderBy(g => g.Key)
            .Select(g => new SensorSamenvatting(
                g.Key.ToString(), g.Count(),
                g.Min(m => m.SensorData.Waarde), g.Max(m => m.SensorData.Waarde), g.Average(m => m.SensorData.Waarde)))
            .ToList();

        var open = incidenten.Where(i => i.Status != IncidentStatus.Opgelost).ToList();
        var zwaarste = open
            .OrderByDescending(i => i.Ernst.Orde())
            .ThenByDescending(i => i.AangemaaktOp)
            .FirstOrDefault();

        var resultaten = new RapportResultaten(
            perSensor,
            TotaalIncidenten: incidenten.Count,
            OpenIncidenten: open.Count,
            OpgelosteIncidenten: incidenten.Count(i => i.Status == IncidentStatus.Opgelost),
            IncidentIds: incidenten.Select(i => i.Id.Waarde).ToList());

        var rapport = new MonitoringRapport(id, kunstwerkId, periodeStart, periodeEind, zwaarste?.Id, resultaten, opgesteldOp);
        rapport.RegistreerEvent(new RapportOpgesteld(kunstwerkId.Waarde, zwaarste?.Id.Waarde, resultaten));
        return rapport;
    }

    public static MonitoringRapport Herstel(RapportId id, KunstwerkReferentie kunstwerkId, DateTime periodeStart,
        DateTime periodeEind, IncidentId? zwaarsteOpenIncident, RapportResultaten resultaten, DateTime opgesteldOp) =>
        new(id, kunstwerkId, periodeStart, periodeEind, zwaarsteOpenIncident, resultaten, opgesteldOp);
}
