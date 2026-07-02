using Microsoft.EntityFrameworkCore;
using Monitoring.Application;
using Monitoring.Domain.Gedeeld;

namespace Monitoring.Infrastructure.Persistence;

public sealed class EfKunstwerkenReadModel(MonitoringDbContext db) : IKunstwerkenReadModel
{
    public async Task<bool> IsBekendEnInGebruikAsync(KunstwerkReferentie kunstwerkId)
    {
        var row = await db.BekendeKunstwerken.AsNoTracking().FirstOrDefaultAsync(k => k.KunstwerkId == kunstwerkId.Waarde);
        return row is { InGebruik: true };
    }

    public async Task<IReadOnlyList<KunstwerkReferentie>> AlleInGebruikAsync()
    {
        var ids = await db.BekendeKunstwerken.AsNoTracking().Where(k => k.InGebruik).Select(k => k.KunstwerkId).ToListAsync();
        return ids.Select(KunstwerkReferentie.Van).ToList();
    }
}
