using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Sessies;

namespace Monitoring.Application.Sessies;

public sealed class PauzeerMonitoringSessie(IMonitoringSessieRepository sessies)
{
    public async Task UitvoerenAsync(string sessieId)
    {
        var sessie = await Laad(sessies, sessieId);
        sessie.Pauzeer();
        await sessies.BewaarAsync(sessie);
    }

    internal static async Task<MonitoringSessie> Laad(IMonitoringSessieRepository sessies, string sessieId) =>
        await sessies.ZoekAsync(SessieId.Van(sessieId)) ?? throw new DomeinFout("sessie niet gevonden");
}

public sealed class HervatMonitoringSessie(IMonitoringSessieRepository sessies)
{
    public async Task UitvoerenAsync(string sessieId)
    {
        var sessie = await PauzeerMonitoringSessie.Laad(sessies, sessieId);
        sessie.Hervat();
        await sessies.BewaarAsync(sessie);
    }
}

public sealed class RondMonitoringSessieAf(IMonitoringSessieRepository sessies, IKlok klok)
{
    public async Task UitvoerenAsync(string sessieId)
    {
        var sessie = await PauzeerMonitoringSessie.Laad(sessies, sessieId);
        sessie.RondAf(klok.Nu());
        await sessies.BewaarAsync(sessie);
    }
}
