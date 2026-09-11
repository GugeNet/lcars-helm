using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Encodings.Web;
using LcarsHelm.Cloud.Core.Storage;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;

namespace LcarsHelm.Cloud.Api.Auth;

public sealed class VesselKeyAuthenticationSchemeOptions : AuthenticationSchemeOptions;

/// <summary>
/// Authenticates a request bearing an ES256 JWT signed with a registered vessel's
/// private key — see <see cref="VesselJwt"/>. There is no shared secret and no user
/// login: the vessel proves it holds the private key matching the public key it
/// registered with. Approval status is not checked here; it is exposed as a claim so
/// the <c>ApprovedVessel</c> policy (and its custom 403 body) can decide what a
/// pending or revoked vessel is allowed to do.
/// </summary>
public sealed class VesselKeyAuthenticationHandler(
    IOptionsMonitor<VesselKeyAuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    IVesselStore vessels,
    IMemoryCache cache)
    : AuthenticationHandler<VesselKeyAuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "VesselKey";
    private static readonly TimeSpan ClockSkew = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan VesselCacheLifetime = TimeSpan.FromMinutes(5);

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue("Authorization", out var authorizationHeader))
        {
            return AuthenticateResult.NoResult();
        }

        var value = authorizationHeader.ToString();
        if (!value.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            return AuthenticateResult.NoResult();
        }
        var token = value["Bearer ".Length..].Trim();

        // The public key needed to verify the signature belongs to whichever vessel
        // the token claims to be, so that has to be read out first — untrusted, purely
        // as a lookup key — before the signature itself can be checked.
        var claimedIssuer = VesselJwt.PeekIssuer(token);
        if (claimedIssuer is null || !Guid.TryParse(claimedIssuer, out var vesselId))
        {
            return AuthenticateResult.Fail("Malformed token.");
        }

        var vessel = await cache.GetOrCreateAsync(
            $"vessel:{vesselId:N}",
            entry =>
            {
                entry.AbsoluteExpirationRelativeToNow = VesselCacheLifetime;
                return vessels.GetAsync(vesselId, Context.RequestAborted);
            });

        if (vessel is null)
        {
            return AuthenticateResult.Fail("Unknown vessel.");
        }

        ECDsa publicKey;
        try
        {
            publicKey = ECDsa.Create();
            publicKey.ImportFromPem(vessel.PublicKeyPem);
        }
        catch (CryptographicException)
        {
            return AuthenticateResult.Fail("Vessel has no usable public key on file.");
        }

        using (publicKey)
        {
            var claims = VesselJwt.Verify(token, publicKey, DateTimeOffset.UtcNow, ClockSkew);
            if (claims is null || claims.Issuer != claimedIssuer)
            {
                return AuthenticateResult.Fail("Invalid or expired token.");
            }
        }

        var identity = new ClaimsIdentity(SchemeName);
        identity.AddClaim(new Claim("vesselId", vessel.Id.ToString()));
        identity.AddClaim(new Claim("vesselName", vessel.Name));
        identity.AddClaim(new Claim("vesselStatus", vessel.Status.ToString()));
        var principal = new ClaimsPrincipal(identity);
        return AuthenticateResult.Success(new AuthenticationTicket(principal, SchemeName));
    }
}
