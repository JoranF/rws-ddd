using Microsoft.EntityFrameworkCore;
using Monitoring.Infrastructure.Persistence.Rows;

namespace Monitoring.Infrastructure.Persistence;

public class MonitoringDbContext(DbContextOptions<MonitoringDbContext> options) : DbContext(options)
{
    public DbSet<BekendKunstwerkRow> BekendeKunstwerken => Set<BekendKunstwerkRow>();
    public DbSet<VerwerktEventRow> VerwerkteEvents => Set<VerwerktEventRow>();
    public DbSet<OutboxMessageRow> Outbox => Set<OutboxMessageRow>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<BekendKunstwerkRow>(e =>
        {
            e.ToTable("bekend_kunstwerk");
            e.HasKey(x => x.KunstwerkId);
        });

        b.Entity<VerwerktEventRow>(e =>
        {
            e.ToTable("verwerkt_event");
            e.HasKey(x => x.EventId);
        });

        b.Entity<OutboxMessageRow>(e =>
        {
            e.ToTable("outbox_message");
            e.HasKey(x => x.Id);
            e.Property(x => x.Payload).HasColumnType("jsonb");
            e.HasIndex(x => new { x.Gepubliceerd, x.AangemaaktOp });
        });
    }
}
