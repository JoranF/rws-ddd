namespace Monitoring.Domain.Gedeeld;

public sealed class DomeinFout(string bericht) : Exception(bericht);
