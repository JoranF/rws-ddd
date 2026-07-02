namespace Monitoring.Domain.Gedeeld;

internal static class Eisen
{
    public static string NietLeeg(string? waarde, string veld) =>
        string.IsNullOrWhiteSpace(waarde) ? throw new DomeinFout($"{veld} mag niet leeg zijn") : waarde;
}
