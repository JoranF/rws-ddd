namespace Monitoring.Domain.Gedeeld;

public enum Ernst
{
    Laag,
    Middel,
    Hoog,
    Kritiek,
}

public static class Ernsten
{
    public static int Orde(this Ernst ernst) => ernst switch
    {
        Ernst.Laag => 1,
        Ernst.Middel => 2,
        Ernst.Hoog => 3,
        Ernst.Kritiek => 4,
        _ => 0,
    };
}
