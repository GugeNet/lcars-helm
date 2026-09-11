using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using LcarsHelm.Cloud.Core.Models;
using LcarsHelm.Cloud.Core.Storage;

namespace LcarsHelm.Cloud.Api.Endpoints;

public sealed record RegisterVesselRequest(string Name, string PublicKeyPem);

public sealed record VesselRegistrationResponse(string VesselId, string Status);

public sealed record VesselStatusResponse(string VesselId, string Name, string Status);

public static class VesselsEndpoints
{
    public static IEndpointRouteBuilder MapVesselsEndpoints(this IEndpointRouteBuilder app)
    {
        var vessels = app.MapGroup("/api/vessels").WithTags("Vessels");

        vessels.MapPost("/register", RegisterAsync)
            .RequireRateLimiting("register")
            .AllowAnonymous();

        vessels.MapGet("/me", Me)
            .RequireAuthorization();

        return app;
    }

    /// <summary>
    /// Registers a vessel's public key, or — if the same key has already registered —
    /// returns the existing vessel. Idempotent on purpose: a Pi that lost its
    /// <c>vessel.json</c> but kept its key file (a fresh SD card image, say) recovers
    /// its identity instead of accumulating duplicate vessel rows every time it tries.
    /// </summary>
    private static async Task<IResult> RegisterAsync(
        RegisterVesselRequest request,
        IVesselStore vessels,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.PublicKeyPem))
        {
            return Results.BadRequest("name and publicKeyPem are required.");
        }

        try
        {
            using var key = ECDsa.Create();
            key.ImportFromPem(request.PublicKeyPem);
        }
        catch (CryptographicException)
        {
            return Results.BadRequest("publicKeyPem is not a usable EC public key.");
        }

        var fingerprint = Fingerprint(request.PublicKeyPem);

        var existing = await vessels.FindByFingerprintAsync(fingerprint, ct);
        if (existing is not null)
        {
            return Results.Ok(new VesselRegistrationResponse(existing.Id.ToString(), existing.Status.ToString()));
        }

        var vessel = new Vessel
        {
            Name = request.Name.Trim(),
            PublicKeyPem = request.PublicKeyPem,
            PublicKeyFingerprint = fingerprint,
            RegisteredAt = DateTimeOffset.UtcNow,
        };
        await vessels.AddAsync(vessel, ct);

        return Results.Created(
            $"/api/vessels/{vessel.Id}",
            new VesselRegistrationResponse(vessel.Id.ToString(), vessel.Status.ToString()));
    }

    /// <summary>What a vessel is allowed to check about itself, whatever its approval status.</summary>
    private static IResult Me(ClaimsPrincipal user)
    {
        var vesselId = user.FindFirstValue("vesselId") ?? string.Empty;
        var name = user.FindFirstValue("vesselName") ?? string.Empty;
        var status = user.FindFirstValue("vesselStatus") ?? string.Empty;
        return Results.Ok(new VesselStatusResponse(vesselId, name, status));
    }

    private static string Fingerprint(string publicKeyPem) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(publicKeyPem))).ToLowerInvariant();
}
