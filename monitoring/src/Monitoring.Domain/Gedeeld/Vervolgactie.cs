namespace Monitoring.Domain.Gedeeld;

public enum Vervolgactie
{
    IntensieverMonitoren,
    Inspectie,
    Onderhoud,
}

public static class Vervolgacties
{
    public static Vervolgactie Voor(Ernst ernst) => ernst switch
    {
        Ernst.Laag => Vervolgactie.IntensieverMonitoren,
        Ernst.Middel => Vervolgactie.Inspectie,
        Ernst.Hoog or Ernst.Kritiek => Vervolgactie.Onderhoud,
        _ => throw new DomeinFout("onbekende ernst"),
    };
}
