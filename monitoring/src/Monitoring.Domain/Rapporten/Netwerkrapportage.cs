using Monitoring.Domain.Gedeeld;

namespace Monitoring.Domain.Rapporten;

public sealed record KunstwerkSamenvatting(string KunstwerkId, int AantalMetingen, int AantalIncidenten, string? ZwaarsteErnst);

public sealed class Netwerkrapportage : AggregateRoot
{
    public RapportId Id { get; }
    public DateTime PeriodeStart { get; }
    public DateTime PeriodeEind { get; }
    public IReadOnlyList<KunstwerkSamenvatting> Kunstwerken { get; }
    public DateTime OpgesteldOp { get; }

    private Netwerkrapportage(RapportId id, DateTime periodeStart, DateTime periodeEind,
        IReadOnlyList<KunstwerkSamenvatting> kunstwerken, DateTime opgesteldOp)
    {
        Id = id;
        PeriodeStart = periodeStart;
        PeriodeEind = periodeEind;
        Kunstwerken = kunstwerken;
        OpgesteldOp = opgesteldOp;
    }

    public static Netwerkrapportage StelOp(RapportId id, DateTime periodeStart, DateTime periodeEind,
        IReadOnlyList<KunstwerkSamenvatting> kunstwerken, DateTime opgesteldOp)
    {
        var rapportage = new Netwerkrapportage(id, periodeStart, periodeEind, kunstwerken, opgesteldOp);
        rapportage.RegistreerEvent(new NetwerkrapportageOpgesteld(
            periodeStart.NaarIso(), periodeEind.NaarIso(), opgesteldOp.NaarIso(), kunstwerken));
        return rapportage;
    }
}
