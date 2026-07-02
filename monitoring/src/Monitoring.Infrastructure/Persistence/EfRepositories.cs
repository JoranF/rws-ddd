using Microsoft.EntityFrameworkCore;
using Monitoring.Application;
using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Incidenten;
using Monitoring.Domain.Rapporten;
using Monitoring.Domain.Sessies;
using Monitoring.Infrastructure.Persistence.Rows;

namespace Monitoring.Infrastructure.Persistence;

public sealed class EfMonitoringSessieRepository(MonitoringDbContext db) : IMonitoringSessieRepository
{
    public async Task BewaarAsync(MonitoringSessie sessie)
    {
        var row = SessieMapper.NaarRow(sessie);
        var bestaand = await db.Sessies.FindAsync(row.Id);
        if (bestaand is null) db.Sessies.Add(row);
        else db.Entry(bestaand).CurrentValues.SetValues(row);
        await db.SaveChangesAsync();
    }

    public async Task<MonitoringSessie?> ZoekAsync(SessieId id)
    {
        var row = await db.Sessies.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id.Waarde);
        return row is null ? null : SessieMapper.NaarDomein(row);
    }

    public async Task<IReadOnlyList<MonitoringSessie>> ZoekAlleAsync()
    {
        var rows = await db.Sessies.AsNoTracking().ToListAsync();
        return rows.Select(SessieMapper.NaarDomein).ToList();
    }

    public async Task<MonitoringSessie?> ZoekLopendeVoorKunstwerkAsync(KunstwerkReferentie kunstwerkId)
    {
        var row = await db.Sessies.AsNoTracking()
            .FirstOrDefaultAsync(x => x.KunstwerkId == kunstwerkId.Waarde && x.Status != "Afgerond");
        return row is null ? null : SessieMapper.NaarDomein(row);
    }
}

public sealed class EfMetingRepository(MonitoringDbContext db) : IMetingRepository
{
    public async Task VoegToeAsync(Meting meting)
    {
        db.Metingen.Add(MetingMapper.NaarRow(meting));
        await db.SaveChangesAsync();
    }

    public async Task<IReadOnlyList<Meting>> ZoekAsync(KunstwerkReferentie kunstwerkId, SensorType? sensorType)
    {
        var q = db.Metingen.AsNoTracking().Where(m => m.KunstwerkId == kunstwerkId.Waarde);
        if (sensorType is not null)
        {
            var st = sensorType.Value.ToString();
            q = q.Where(m => m.SensorType == st);
        }
        var rows = await q.OrderBy(m => m.Tijdstip).ToListAsync();
        return rows.Select(MetingMapper.NaarDomein).ToList();
    }

    public async Task<IReadOnlyList<Meting>> ZoekInPeriodeAsync(KunstwerkReferentie kunstwerkId, DateTime start, DateTime eind)
    {
        var rows = await db.Metingen.AsNoTracking()
            .Where(m => m.KunstwerkId == kunstwerkId.Waarde && m.Tijdstip >= start && m.Tijdstip <= eind)
            .ToListAsync();
        return rows.Select(MetingMapper.NaarDomein).ToList();
    }
}

public sealed class EfIncidentRepository(MonitoringDbContext db) : IIncidentRepository
{
    public async Task BewaarAsync(Incident incident)
    {
        var row = IncidentMapper.NaarRow(incident);
        var bestaand = await db.Incidenten.FindAsync(row.Id);
        if (bestaand is null) db.Incidenten.Add(row);
        else db.Entry(bestaand).CurrentValues.SetValues(row);
        await db.SaveChangesAsync();
    }

    public async Task<Incident?> ZoekAsync(IncidentId id)
    {
        var row = await db.Incidenten.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id.Waarde);
        return row is null ? null : IncidentMapper.NaarDomein(row);
    }

    public async Task<IReadOnlyList<Incident>> ZoekAsync(IncidentStatus? status, KunstwerkReferentie? kunstwerkId)
    {
        var q = db.Incidenten.AsNoTracking().AsQueryable();
        if (status is not null)
        {
            var s = status.Value.ToString();
            q = q.Where(i => i.Status == s);
        }
        if (kunstwerkId is not null)
            q = q.Where(i => i.KunstwerkId == kunstwerkId.Waarde);
        var rows = await q.ToListAsync();
        return rows.Select(IncidentMapper.NaarDomein).ToList();
    }

    public async Task<IReadOnlyList<Incident>> ZoekInPeriodeAsync(KunstwerkReferentie kunstwerkId, DateTime start, DateTime eind)
    {
        var rows = await db.Incidenten.AsNoTracking()
            .Where(i => i.KunstwerkId == kunstwerkId.Waarde && i.AangemaaktOp >= start && i.AangemaaktOp <= eind)
            .ToListAsync();
        return rows.Select(IncidentMapper.NaarDomein).ToList();
    }
}

public sealed class EfRapportRepository(MonitoringDbContext db) : IRapportRepository
{
    public async Task BewaarAsync(MonitoringRapport rapport)
    {
        db.Rapporten.Add(RapportMapper.NaarRow(rapport)); // write-once
        await db.SaveChangesAsync();
    }

    public async Task<MonitoringRapport?> ZoekAsync(RapportId id)
    {
        var row = await db.Rapporten.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id.Waarde);
        return row is null ? null : RapportMapper.NaarDomein(row);
    }

    public async Task<IReadOnlyList<MonitoringRapport>> ZoekAsync(KunstwerkReferentie? kunstwerkId)
    {
        var q = db.Rapporten.AsNoTracking().AsQueryable();
        if (kunstwerkId is not null)
            q = q.Where(r => r.KunstwerkId == kunstwerkId.Waarde);
        var rows = await q.ToListAsync();
        return rows.Select(RapportMapper.NaarDomein).ToList();
    }
}
