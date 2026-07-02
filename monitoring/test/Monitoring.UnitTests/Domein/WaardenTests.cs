using Monitoring.Domain.Gedeeld;
using Xunit;

namespace Monitoring.UnitTests.Domein;

public class WaardenTests
{
    [Fact]
    public void KunstwerkReferentie_weigert_een_lege_waarde()
        => Assert.Throws<DomeinFout>(() => KunstwerkReferentie.Van(""));

    [Fact]
    public void KunstwerkReferentie_is_gelijk_bij_dezelfde_waarde()
        => Assert.Equal(KunstwerkReferentie.Van("KW-1"), KunstwerkReferentie.Van("KW-1"));

    [Fact]
    public void SessieId_weigert_een_lege_waarde()
        => Assert.Throws<DomeinFout>(() => SessieId.Van("   "));
}
