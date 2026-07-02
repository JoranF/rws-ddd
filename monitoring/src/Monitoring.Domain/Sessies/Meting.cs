using Monitoring.Domain.Gedeeld;

namespace Monitoring.Domain.Sessies;

public sealed record Meting(
    MetingId Id,
    SessieId SessieId,
    KunstwerkReferentie KunstwerkId,
    SensorData SensorData,
    DateTime Tijdstip);
