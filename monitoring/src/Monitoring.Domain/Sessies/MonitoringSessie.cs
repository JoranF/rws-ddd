using Monitoring.Domain.Gedeeld;

namespace Monitoring.Domain.Sessies;

public enum MonitoringStatus
{
    Actief,
    Gepauzeerd,
    Afgerond,
}

public sealed class MonitoringSessie : AggregateRoot
{
    public SessieId Id { get; }
    public KunstwerkReferentie KunstwerkId { get; }
    public MonitoringStatus Status { get; private set; }
    public DateTime GestartOp { get; }
    public DateTime? BeeindigdOp { get; private set; }
    public int AantalMetingen { get; private set; }

    private MonitoringSessie(SessieId id, KunstwerkReferentie kunstwerkId, MonitoringStatus status,
        DateTime gestartOp, DateTime? beeindigdOp, int aantalMetingen)
    {
        Id = id;
        KunstwerkId = kunstwerkId;
        Status = status;
        GestartOp = gestartOp;
        BeeindigdOp = beeindigdOp;
        AantalMetingen = aantalMetingen;
    }

    public static MonitoringSessie Start(SessieId id, KunstwerkReferentie kunstwerkId, DateTime gestartOp) =>
        new(id, kunstwerkId, MonitoringStatus.Actief, gestartOp, null, 0);

    public static MonitoringSessie Herstel(SessieId id, KunstwerkReferentie kunstwerkId, MonitoringStatus status,
        DateTime gestartOp, DateTime? beeindigdOp, int aantalMetingen) =>
        new(id, kunstwerkId, status, gestartOp, beeindigdOp, aantalMetingen);

    public Meting RegistreerMeting(MetingId id, SensorData sensorData, DateTime tijdstip)
    {
        if (Status != MonitoringStatus.Actief)
            throw new DomeinFout("meten kan alleen bij een actieve sessie");
        AantalMetingen++;
        var meting = new Meting(id, Id, KunstwerkId, sensorData, tijdstip);
        RegistreerEvent(new MetingGeregistreerd(
            id.Waarde, Id.Waarde, KunstwerkId.Waarde,
            sensorData.SensorType.ToString(), sensorData.Waarde, sensorData.Eenheid, tijdstip.NaarIso()));
        return meting;
    }

    public void Pauzeer()
    {
        if (Status != MonitoringStatus.Actief)
            throw new DomeinFout("pauzeren kan alleen bij een actieve sessie");
        Status = MonitoringStatus.Gepauzeerd;
    }

    public void Hervat()
    {
        if (Status != MonitoringStatus.Gepauzeerd)
            throw new DomeinFout("hervatten kan alleen bij een gepauzeerde sessie");
        Status = MonitoringStatus.Actief;
    }

    public void RondAf(DateTime op)
    {
        if (Status == MonitoringStatus.Afgerond)
            throw new DomeinFout("sessie is al afgerond");
        Status = MonitoringStatus.Afgerond;
        BeeindigdOp = op;
    }
}
