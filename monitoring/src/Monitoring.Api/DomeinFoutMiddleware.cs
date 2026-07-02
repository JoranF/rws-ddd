using Monitoring.Domain.Gedeeld;

namespace Monitoring.Api;

public sealed class DomeinFoutMiddleware(RequestDelegate next)
{
    public async Task Invoke(HttpContext ctx)
    {
        try
        {
            await next(ctx);
        }
        catch (DomeinFout fout)
        {
            ctx.Response.StatusCode = StatusCodes.Status400BadRequest;
            await ctx.Response.WriteAsJsonAsync(new { fout = fout.Message });
        }
    }
}
