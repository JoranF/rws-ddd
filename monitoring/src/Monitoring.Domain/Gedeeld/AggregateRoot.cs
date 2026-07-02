namespace Monitoring.Domain.Gedeeld;

public abstract class AggregateRoot
{
    private readonly List<IDomainEvent> _events = new();

    protected void RegistreerEvent(IDomainEvent domeinEvent) => _events.Add(domeinEvent);

    public IReadOnlyList<IDomainEvent> TrekEventsLeeg()
    {
        var uit = _events.ToList();
        _events.Clear();
        return uit;
    }
}
