using Monitoring.Domain.Gedeeld;

namespace Monitoring.Domain.Incidenten;

public enum IncidentStatus
{
    Nieuw,
    InBehandeling,
    Opgelost,
}

public sealed class Incident : AggregateRoot
{
    public IncidentId Id { get; }
    public KunstwerkReferentie KunstwerkId { get; }
    public SensorType SensorType { get; }
    public double GemetenWaarde { get; }
    public double Drempelwaarde { get; }
    public Ernst Ernst { get; }
    public string Omschrijving { get; }
    public Vervolgactie Vervolgactie { get; }
    public IncidentStatus Status { get; private set; }
    public DateTime AangemaaktOp { get; }
    public DateTime? OpgelostOp { get; private set; }

    private Incident(IncidentId id, KunstwerkReferentie kunstwerkId, SensorType sensorType, double gemetenWaarde,
        double drempelwaarde, Ernst ernst, string omschrijving, Vervolgactie vervolgactie, IncidentStatus status,
        DateTime aangemaaktOp, DateTime? opgelostOp)
    {
        Id = id;
        KunstwerkId = kunstwerkId;
        SensorType = sensorType;
        GemetenWaarde = gemetenWaarde;
        Drempelwaarde = drempelwaarde;
        Ernst = ernst;
        Omschrijving = omschrijving;
        Vervolgactie = vervolgactie;
        Status = status;
        AangemaaktOp = aangemaaktOp;
        OpgelostOp = opgelostOp;
    }

    public static Incident MaakAan(IncidentId id, KunstwerkReferentie kunstwerkId, Afwijking afwijking)
    {
        var vervolgactie = Vervolgacties.Voor(afwijking.Ernst);
        var incident = new Incident(id, kunstwerkId, afwijking.SensorType, afwijking.GemetenWaarde,
            afwijking.Drempelwaarde, afwijking.Ernst, afwijking.Omschrijving, vervolgactie,
            IncidentStatus.Nieuw, afwijking.Tijdstip, null);
        incident.RegistreerEvent(new IncidentAangemaakt(
            id.Waarde, kunstwerkId.Waarde, afwijking.Ernst.ToString(), afwijking.Omschrijving,
            afwijking.SensorType.ToString(), vervolgactie.ToString()));
        return incident;
    }

    public static Incident Herstel(IncidentId id, KunstwerkReferentie kunstwerkId, SensorType sensorType,
        double gemetenWaarde, double drempelwaarde, Ernst ernst, string omschrijving, Vervolgactie vervolgactie,
        IncidentStatus status, DateTime aangemaaktOp, DateTime? opgelostOp) =>
        new(id, kunstwerkId, sensorType, gemetenWaarde, drempelwaarde, ernst, omschrijving, vervolgactie, status, aangemaaktOp, opgelostOp);

    public void NeemInBehandeling()
    {
        if (Status != IncidentStatus.Nieuw)
            throw new DomeinFout("in behandeling nemen kan alleen vanaf Nieuw");
        Status = IncidentStatus.InBehandeling;
    }

    public void LosOp(DateTime datum)
    {
        if (Status == IncidentStatus.Opgelost)
            throw new DomeinFout("incident is al opgelost");
        Status = IncidentStatus.Opgelost;
        OpgelostOp = datum;
        RegistreerEvent(new IncidentOpgelost(Id.Waarde, KunstwerkId.Waarde, datum.NaarIso()));
    }
}
