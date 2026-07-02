using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Incidenten;
using Monitoring.Domain.Rapporten;
using Monitoring.Domain.Sessies;

namespace Monitoring.Api;

public sealed record StartSessieRequest(string KunstwerkId);
public sealed record RegistreerMetingRequest(string KunstwerkId, string SensorType, double Waarde);
public sealed record StelRapportOpRequest(string KunstwerkId, DateTime PeriodeStart, DateTime PeriodeEind);
public sealed record StelNetwerkrapportageRequest(DateTime PeriodeStart, DateTime PeriodeEind);

public sealed record SessieDto(string Id, string KunstwerkId, string Status, string GestartOp, string? BeeindigdOp, int AantalMetingen)
{
    public static SessieDto Van(MonitoringSessie s) =>
        new(s.Id.Waarde, s.KunstwerkId.Waarde, s.Status.ToString(), s.GestartOp.NaarIso(), s.BeeindigdOp?.NaarIso(), s.AantalMetingen);
}

public sealed record MetingDto(string Id, string KunstwerkId, string SensorType, double Waarde, string Eenheid, string Tijdstip)
{
    public static MetingDto Van(Meting m) =>
        new(m.Id.Waarde, m.KunstwerkId.Waarde, m.SensorData.SensorType.ToString(), m.SensorData.Waarde, m.SensorData.Eenheid, m.Tijdstip.NaarIso());
}

public sealed record IncidentDto(string Id, string KunstwerkId, string SensorType, double GemetenWaarde, double Drempelwaarde,
    string Ernst, string Omschrijving, string Vervolgactie, string Status, string AangemaaktOp, string? OpgelostOp)
{
    public static IncidentDto Van(Incident i) =>
        new(i.Id.Waarde, i.KunstwerkId.Waarde, i.SensorType.ToString(), i.GemetenWaarde, i.Drempelwaarde, i.Ernst.ToString(),
            i.Omschrijving, i.Vervolgactie.ToString(), i.Status.ToString(), i.AangemaaktOp.NaarIso(), i.OpgelostOp?.NaarIso());
}

public sealed record RapportDto(string Id, string KunstwerkId, string PeriodeStart, string PeriodeEind,
    string? ZwaarsteOpenIncidentId, RapportResultaten Resultaten, string OpgesteldOp)
{
    public static RapportDto Van(MonitoringRapport r) =>
        new(r.Id.Waarde, r.KunstwerkId.Waarde, r.PeriodeStart.NaarIso(), r.PeriodeEind.NaarIso(),
            r.ZwaarsteOpenIncident?.Waarde, r.Resultaten, r.OpgesteldOp.NaarIso());
}
