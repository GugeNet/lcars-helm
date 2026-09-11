using LcarsHelm.Cloud.Core.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Policy;
// IAuthorizationMiddlewareResultHandler lives in Microsoft.AspNetCore.Authorization;
// the default implementation it wraps, AuthorizationMiddlewareResultHandler, lives
// one namespace deeper in .Policy. Both usings are needed.

namespace LcarsHelm.Cloud.Api.Auth;

/// <summary>
/// Turns a failed <c>ApprovedVessel</c> check into a body that says which of the two
/// reasons applies, rather than a bare 403 — a Pi retrying blindly on either one for
/// weeks is exactly the failure mode this is meant to make visible in the journal.
/// </summary>
public sealed class VesselAuthorizationResultHandler : IAuthorizationMiddlewareResultHandler
{
    private readonly AuthorizationMiddlewareResultHandler _default = new();

    public async Task HandleAsync(
        RequestDelegate next,
        HttpContext context,
        AuthorizationPolicy policy,
        PolicyAuthorizationResult authorizeResult)
    {
        if (authorizeResult.Forbidden)
        {
            var status = context.User.FindFirst("vesselStatus")?.Value;
            if (status == nameof(VesselStatus.Pending))
            {
                await WriteProblem(context, "vessel-pending", "This vessel is awaiting approval in the dashboard.");
                return;
            }
            if (status == nameof(VesselStatus.Revoked))
            {
                await WriteProblem(context, "vessel-revoked", "This vessel's access has been revoked.");
                return;
            }
        }

        await _default.HandleAsync(next, context, policy, authorizeResult);
    }

    private static async Task WriteProblem(HttpContext context, string type, string detail)
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        context.Response.ContentType = "application/problem+json";
        await context.Response.WriteAsJsonAsync(new { type, title = "Forbidden", status = 403, detail });
    }
}
