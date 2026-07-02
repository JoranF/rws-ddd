using Monitoring.Application;
using Monitoring.Application.Incidenten;
using Monitoring.Application.Metingen;
using Monitoring.Application.Rapporten;
using Monitoring.Application.Sessies;
using Monitoring.Domain.Gedeeld;
using Monitoring.Domain.Incidenten;

namespace Monitoring.Api;

public static class Endpoints
{
    public static void MapMonitoringEndpoints(this IEndpointRouteBuilder app)
    {
        var sessies = app.MapGroup("/api/sessies");
        sessies.MapPost("", async (StartSessieRequest req, StartMonitoringSessie uc) =>
        {
            var id = await uc.UitvoerenAsync(new StartMonitoringSessieCommand(req.KunstwerkId));
            return Results.Created($"/api/sessies/{id}", new { id });
        });
        sessies.MapPost("/{id}/pauzering", async (string id, PauzeerMonitoringSessie uc) =>
        {
            await uc.UitvoerenAsync(id);
            return Results.NoContent();
        });
        sessies.MapPost("/{id}/hervatting", async (string id, HervatMonitoringSessie uc) =>
        {
            await uc.UitvoerenAsync(id);
            return Results.NoContent();
        });
        sessies.MapPost("/{id}/afronding", async (string id, RondMonitoringSessieAf uc) =>
        {
            await uc.UitvoerenAsync(id);
            return Results.NoContent();
        });
        sessies.MapGet("", async (IMonitoringSessieRepository repo) =>
            Results.Ok((await repo.ZoekAlleAsync()).Select(SessieDto.Van)));
        sessies.MapGet("/{id}", async (string id, IMonitoringSessieRepository repo) =>
        {
            var s = await repo.ZoekAsync(SessieId.Van(id));
            return s is null ? Results.NotFound() : Results.Ok(SessieDto.Van(s));
        });

        var metingen = app.MapGroup("/api/metingen");
        metingen.MapPost("", async (RegistreerMetingRequest req, RegistreerMeting uc) =>
        {
            var r = await uc.UitvoerenAsync(new RegistreerMetingCommand(req.KunstwerkId, req.SensorType, req.Waarde));
            return Results.Created($"/api/metingen/{r.MetingId}", r);
        });
        metingen.MapGet("", async (string kunstwerkId, string? sensorType, IMetingRepository repo) =>
        {
            SensorType? st = sensorType is null ? null : Enum.Parse<SensorType>(sensorType);
            var gevonden = await repo.ZoekAsync(KunstwerkReferentie.Van(kunstwerkId), st);
            return Results.Ok(gevonden.Select(MetingDto.Van));
        });

        var incidenten = app.MapGroup("/api/incidenten");
        incidenten.MapPost("/{id}/inbehandelingname", async (string id, NeemIncidentInBehandeling uc) =>
        {
            await uc.UitvoerenAsync(id);
            return Results.NoContent();
        });
        incidenten.MapPost("/{id}/oplossing", async (string id, LosIncidentOp uc) =>
        {
            await uc.UitvoerenAsync(id);
            return Results.NoContent();
        });
        incidenten.MapGet("", async (string? status, string? kunstwerkId, IIncidentRepository repo) =>
        {
            IncidentStatus? st = status is null ? null : Enum.Parse<IncidentStatus>(status);
            KunstwerkReferentie? kw = kunstwerkId is null ? null : KunstwerkReferentie.Van(kunstwerkId);
            return Results.Ok((await repo.ZoekAsync(st, kw)).Select(IncidentDto.Van));
        });
        incidenten.MapGet("/{id}", async (string id, IIncidentRepository repo) =>
        {
            var i = await repo.ZoekAsync(IncidentId.Van(id));
            return i is null ? Results.NotFound() : Results.Ok(IncidentDto.Van(i));
        });

        var rapporten = app.MapGroup("/api/rapporten");
        rapporten.MapPost("", async (StelRapportOpRequest req, StelRapportOp uc) =>
        {
            var id = await uc.UitvoerenAsync(new StelRapportOpCommand(req.KunstwerkId, req.PeriodeStart, req.PeriodeEind));
            return Results.Created($"/api/rapporten/{id}", new { id });
        });
        rapporten.MapGet("", async (string? kunstwerkId, IRapportRepository repo) =>
        {
            KunstwerkReferentie? kw = kunstwerkId is null ? null : KunstwerkReferentie.Van(kunstwerkId);
            return Results.Ok((await repo.ZoekAsync(kw)).Select(RapportDto.Van));
        });
        rapporten.MapGet("/{id}", async (string id, IRapportRepository repo) =>
        {
            var r = await repo.ZoekAsync(RapportId.Van(id));
            return r is null ? Results.NotFound() : Results.Ok(RapportDto.Van(r));
        });

        app.MapPost("/api/netwerkrapportages", async (StelNetwerkrapportageRequest req, StelNetwerkrapportageOp uc) =>
        {
            var id = await uc.UitvoerenAsync(new StelNetwerkrapportageOpCommand(req.PeriodeStart, req.PeriodeEind));
            return Results.Created($"/api/netwerkrapportages/{id}", new { id });
        });
    }
}
