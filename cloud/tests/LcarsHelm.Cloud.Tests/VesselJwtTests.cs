using System.Security.Cryptography;
using LcarsHelm.Cloud.Api.Auth;

namespace LcarsHelm.Cloud.Tests;

public class VesselJwtTests
{
    private static ECDsa NewKey() => ECDsa.Create(ECCurve.NamedCurves.nistP256);

    [Fact]
    public void Verify_AcceptsATokenSignedWithTheMatchingKey()
    {
        using var key = NewKey();
        var vesselId = Guid.NewGuid().ToString();
        var now = DateTimeOffset.UtcNow;

        var token = VesselJwt.Mint(vesselId, key, TimeSpan.FromMinutes(5), now);
        var claims = VesselJwt.Verify(token, key, now, TimeSpan.FromMinutes(5));

        Assert.NotNull(claims);
        Assert.Equal(vesselId, claims!.Issuer);
    }

    [Fact]
    public void Verify_RejectsATokenSignedWithADifferentKey()
    {
        using var signingKey = NewKey();
        using var otherKey = NewKey();
        var vesselId = Guid.NewGuid().ToString();
        var now = DateTimeOffset.UtcNow;

        var token = VesselJwt.Mint(vesselId, signingKey, TimeSpan.FromMinutes(5), now);
        var claims = VesselJwt.Verify(token, otherKey, now, TimeSpan.FromMinutes(5));

        Assert.Null(claims);
    }

    [Fact]
    public void Verify_RejectsAnExpiredToken()
    {
        using var key = NewKey();
        var vesselId = Guid.NewGuid().ToString();
        var mintedAt = DateTimeOffset.UtcNow.AddMinutes(-10);

        var token = VesselJwt.Mint(vesselId, key, TimeSpan.FromMinutes(5), mintedAt);
        // Ten minutes after a five-minute token with a one-minute skew: well outside
        // any tolerance, so this must not be a false pass.
        var claims = VesselJwt.Verify(token, key, DateTimeOffset.UtcNow, TimeSpan.FromMinutes(1));

        Assert.Null(claims);
    }

    [Fact]
    public void Verify_AllowsClockSkewWithinTolerance()
    {
        using var key = NewKey();
        var vesselId = Guid.NewGuid().ToString();
        var mintedAt = DateTimeOffset.UtcNow;

        var token = VesselJwt.Mint(vesselId, key, TimeSpan.FromMinutes(5), mintedAt);
        // Just past expiry, but within the allowed skew.
        var justAfterExpiry = mintedAt.AddMinutes(5).AddSeconds(30);
        var claims = VesselJwt.Verify(token, key, justAfterExpiry, TimeSpan.FromMinutes(5));

        Assert.NotNull(claims);
    }

    [Fact]
    public void Verify_RejectsGarbage()
    {
        using var key = NewKey();

        Assert.Null(VesselJwt.Verify("not-a-jwt", key, DateTimeOffset.UtcNow, TimeSpan.FromMinutes(5)));
        Assert.Null(VesselJwt.Verify("a.b.c", key, DateTimeOffset.UtcNow, TimeSpan.FromMinutes(5)));
    }

    [Fact]
    public void PeekIssuer_ReadsTheIssuerWithoutVerifyingTheSignature()
    {
        using var key = NewKey();
        var vesselId = Guid.NewGuid().ToString();

        var token = VesselJwt.Mint(vesselId, key, TimeSpan.FromMinutes(5));

        Assert.Equal(vesselId, VesselJwt.PeekIssuer(token));
    }
}
