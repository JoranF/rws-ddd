namespace Monitoring.Domain.Gedeeld;

public sealed record KunstwerkReferentie
{
    public string Waarde { get; }
    private KunstwerkReferentie(string waarde) => Waarde = waarde;
    public static KunstwerkReferentie Van(string waarde) => new(Eisen.NietLeeg(waarde, "kunstwerkId"));
    public override string ToString() => Waarde;
}

public sealed record SessieId
{
    public string Waarde { get; }
    private SessieId(string waarde) => Waarde = waarde;
    public static SessieId Van(string waarde) => new(Eisen.NietLeeg(waarde, "sessieId"));
    public override string ToString() => Waarde;
}

public sealed record MetingId
{
    public string Waarde { get; }
    private MetingId(string waarde) => Waarde = waarde;
    public static MetingId Van(string waarde) => new(Eisen.NietLeeg(waarde, "metingId"));
    public override string ToString() => Waarde;
}

public sealed record IncidentId
{
    public string Waarde { get; }
    private IncidentId(string waarde) => Waarde = waarde;
    public static IncidentId Van(string waarde) => new(Eisen.NietLeeg(waarde, "incidentId"));
    public override string ToString() => Waarde;
}

public sealed record RapportId
{
    public string Waarde { get; }
    private RapportId(string waarde) => Waarde = waarde;
    public static RapportId Van(string waarde) => new(Eisen.NietLeeg(waarde, "rapportId"));
    public override string ToString() => Waarde;
}
