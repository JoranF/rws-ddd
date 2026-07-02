using Microsoft.EntityFrameworkCore;
using Monitoring.Infrastructure.Persistence.Rows;

namespace Monitoring.Infrastructure.Persistence;

public class MonitoringDbContext(DbContextOptions<MonitoringDbContext> options) : DbContext(options)
{
    public DbSet<BekendKunstwerkRow> BekendeKunstwerken => Set<BekendKunstwerkRow>();
    public DbSet<VerwerktEventRow> VerwerkteEvents => Set<VerwerktEventRow>();
    public DbSet<OutboxMessageRow> Outbox => Set<OutboxMessageRow>();
    public DbSet<MonitoringSessieRow> Sessies => Set<MonitoringSessieRow>();
    public DbSet<MetingRow> Metingen => Set<MetingRow>();
    public DbSet<IncidentRow> Incidenten => Set<IncidentRow>();
    public DbSet<MonitoringRapportRow> Rapporten => Set<MonitoringRapportRow>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<BekendKunstwerkRow>(e => { e.ToTable("bekend_kunstwerk"); e.HasKey(x => x.KunstwerkId); });
        b.Entity<VerwerktEventRow>(e => { e.ToTable("verwerkt_event"); e.HasKey(x => x.EventId); });
        b.Entity<OutboxMessageRow>(e =>
        {
            e.ToTable("outbox_message");
            e.HasKey(x => x.Id);
            e.Property(x => x.Payload).HasColumnType("jsonb");
            e.HasIndex(x => new { x.Gepubliceerd, x.AangemaaktOp });
        });

        b.Entity<MonitoringSessieRow>(e =>
        {
            e.ToTable("monitoring_sessie");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.KunstwerkId);
        });
        b.Entity<MetingRow>(e =>
        {
            e.ToTable("meting");
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.KunstwerkId, x.Tijdstip });
        });
        b.Entity<IncidentRow>(e =>
        {
            e.ToTable("incident");
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.KunstwerkId, x.Status });
        });
        b.Entity<MonitoringRapportRow>(e =>
        {
            e.ToTable("monitoring_rapport");
            e.HasKey(x => x.Id);
            e.Property(x => x.Resultaten).HasColumnType("jsonb");
        });
    }
}
