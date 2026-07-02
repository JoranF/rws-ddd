using Monitoring.Domain.Gedeeld;

namespace Monitoring.Application;

public static class Kunstwerkbewaking
{
    /// <summary>Streng: weiger onbekend/buitengebruikgesteld kunstwerk. Soepel: laat door.</summary>
    public static async Task BewaakAsync(IKunstwerkenReadModel kunstwerken, ValidatiePosture validatie, KunstwerkReferentie kunstwerkId)
    {
        if (await kunstwerken.IsBekendEnInGebruikAsync(kunstwerkId))
            return;
        if (validatie == ValidatiePosture.Streng)
            throw new DomeinFout($"kunstwerk {kunstwerkId.Waarde} is onbekend of buiten gebruik");
    }
}
