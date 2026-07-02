using System.Text.Json;
using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Incidenten;
using Monitoring.Domain.Rapporten;
using Monitoring.Domain.Sessies;
using Monitoring.Infrastructure.Persistence.Rows;

namespace Monitoring.Infrastructure.Persistence;

public static class SessieMapper
{
    public static MonitoringSessieRow NaarRow(MonitoringSessie s) => new()
    {
        Id = s.Id.Waarde,
        KunstwerkId = s.KunstwerkId.Waarde,
        Status = s.Status.ToString(),
        GestartOp = s.GestartOp,
        BeeindigdOp = s.BeeindigdOp,
        AantalMetingen = s.AantalMetingen,
    };

    public static MonitoringSessie NaarDomein(MonitoringSessieRow r) => MonitoringSessie.Herstel(
        SessieId.Van(r.Id), KunstwerkReferentie.Van(r.KunstwerkId),
        Enum.Parse<MonitoringStatus>(r.Status), r.GestartOp, r.BeeindigdOp, r.AantalMetingen);
}

public static class MetingMapper
{
    public static MetingRow NaarRow(Meting m) => new()
    {
        Id = m.Id.Waarde,
        SessieId = m.SessieId.Waarde,
        KunstwerkId = m.KunstwerkId.Waarde,
        SensorType = m.SensorData.SensorType.ToString(),
        Waarde = m.SensorData.Waarde,
        Eenheid = m.SensorData.Eenheid,
        Tijdstip = m.Tijdstip,
    };

    public static Meting NaarDomein(MetingRow r) => new(
        MetingId.Van(r.Id), SessieId.Van(r.SessieId), KunstwerkReferentie.Van(r.KunstwerkId),
        SensorData.Van(Enum.Parse<SensorType>(r.SensorType), r.Waarde), r.Tijdstip);
}

public static class IncidentMapper
{
    public static IncidentRow NaarRow(Incident i) => new()
    {
        Id = i.Id.Waarde,
        KunstwerkId = i.KunstwerkId.Waarde,
        SensorType = i.SensorType.ToString(),
        GemetenWaarde = i.GemetenWaarde,
        Drempelwaarde = i.Drempelwaarde,
        Ernst = i.Ernst.ToString(),
        Omschrijving = i.Omschrijving,
        Vervolgactie = i.Vervolgactie.ToString(),
        Status = i.Status.ToString(),
        AangemaaktOp = i.AangemaaktOp,
        OpgelostOp = i.OpgelostOp,
    };

    public static Incident NaarDomein(IncidentRow r) => Incident.Herstel(
        IncidentId.Van(r.Id), KunstwerkReferentie.Van(r.KunstwerkId), Enum.Parse<SensorType>(r.SensorType),
        r.GemetenWaarde, r.Drempelwaarde, Enum.Parse<Ernst>(r.Ernst), r.Omschrijving,
        Enum.Parse<Vervolgactie>(r.Vervolgactie), Enum.Parse<IncidentStatus>(r.Status), r.AangemaaktOp, r.OpgelostOp);
}

public static class RapportMapper
{
    public static MonitoringRapportRow NaarRow(MonitoringRapport r) => new()
    {
        Id = r.Id.Waarde,
        KunstwerkId = r.KunstwerkId.Waarde,
        PeriodeStart = r.PeriodeStart,
        PeriodeEind = r.PeriodeEind,
        ZwaarsteOpenIncidentId = r.ZwaarsteOpenIncident?.Waarde,
        Resultaten = JsonSerializer.Serialize(r.Resultaten, Serialisatie.Opties),
        OpgesteldOp = r.OpgesteldOp,
    };

    public static MonitoringRapport NaarDomein(MonitoringRapportRow r) => MonitoringRapport.Herstel(
        RapportId.Van(r.Id), KunstwerkReferentie.Van(r.KunstwerkId), r.PeriodeStart, r.PeriodeEind,
        r.ZwaarsteOpenIncidentId is null ? null : IncidentId.Van(r.ZwaarsteOpenIncidentId),
        JsonSerializer.Deserialize<RapportResultaten>(r.Resultaten, Serialisatie.Opties)!, r.OpgesteldOp);
}
