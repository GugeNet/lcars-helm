using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace LcarsHelm.Cloud.Api.Auth;

/// <summary>
/// A minimal ES256 JWT: just enough to prove "signed by this vessel's private key",
/// nothing more. No external JWT package — the shape needed is a handful of fields,
/// and a dependency would buy nothing but surface area. The plugin mints its own
/// tokens the same way in TypeScript; <see cref="Mint"/> exists mainly so this format
/// can be tested from one side without standing up the other.
/// </summary>
public static class VesselJwt
{
    /// <summary>Claims that verified successfully.</summary>
    public sealed record Claims(string Issuer, DateTimeOffset IssuedAt, DateTimeOffset ExpiresAt);

    public static string Mint(string vesselId, ECDsa privateKey, TimeSpan lifetime, DateTimeOffset? now = null)
    {
        var issuedAt = now ?? DateTimeOffset.UtcNow;
        var header = Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(new { alg = "ES256", typ = "JWT" }));
        var payload = Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(new
        {
            iss = vesselId,
            sub = vesselId,
            iat = issuedAt.ToUnixTimeSeconds(),
            exp = issuedAt.Add(lifetime).ToUnixTimeSeconds(),
            jti = Guid.NewGuid().ToString("N")
        }));
        var signingInput = $"{header}.{payload}";
        var signature = privateKey.SignData(
            Encoding.ASCII.GetBytes(signingInput),
            HashAlgorithmName.SHA256,
            DSASignatureFormat.IeeeP1363FixedFieldConcatenation);
        return $"{signingInput}.{Base64UrlEncode(signature)}";
    }

    /// <summary>
    /// Reads the <c>iss</c> claim without verifying the signature — used only to know
    /// which vessel's public key to check the token against. Never trust anything
    /// this returns; it exists solely to feed <see cref="Verify"/>.
    /// </summary>
    public static string? PeekIssuer(string token)
    {
        var parts = token.Split('.');
        if (parts.Length != 3) return null;
        try
        {
            var payload = JsonSerializer.Deserialize<JsonElement>(Base64UrlDecode(parts[1]));
            return payload.TryGetProperty("iss", out var issuer) ? issuer.GetString() : null;
        }
        catch (FormatException) { return null; }
        catch (JsonException) { return null; }
    }

    /// <summary>
    /// Verifies the signature and standard claims against <paramref name="publicKey"/>.
    /// Returns null if the token is malformed, does not verify, or has expired outside
    /// <paramref name="clockSkew"/> — the Pi's clock is not always trustworthy at boot,
    /// which is exactly why a skew is allowed rather than assumed away.
    /// </summary>
    public static Claims? Verify(string token, ECDsa publicKey, DateTimeOffset now, TimeSpan clockSkew)
    {
        var parts = token.Split('.');
        if (parts.Length != 3) return null;

        byte[] signature;
        byte[] payloadBytes;
        try
        {
            payloadBytes = Base64UrlDecode(parts[1]);
            signature = Base64UrlDecode(parts[2]);
        }
        catch (FormatException)
        {
            return null;
        }

        var signingInput = Encoding.ASCII.GetBytes($"{parts[0]}.{parts[1]}");
        if (!publicKey.VerifyData(
            signingInput,
            signature,
            HashAlgorithmName.SHA256,
            DSASignatureFormat.IeeeP1363FixedFieldConcatenation))
        {
            return null;
        }

        JsonElement payload;
        try
        {
            payload = JsonSerializer.Deserialize<JsonElement>(payloadBytes);
        }
        catch (JsonException)
        {
            return null;
        }

        if (!payload.TryGetProperty("iss", out var issuerProperty) || issuerProperty.GetString() is not { } issuer)
        {
            return null;
        }
        if (!payload.TryGetProperty("iat", out var issuedAtProperty) ||
            !payload.TryGetProperty("exp", out var expiresAtProperty))
        {
            return null;
        }

        var issuedAt = DateTimeOffset.FromUnixTimeSeconds(issuedAtProperty.GetInt64());
        var expiresAt = DateTimeOffset.FromUnixTimeSeconds(expiresAtProperty.GetInt64());

        if (now < issuedAt - clockSkew || now > expiresAt + clockSkew)
        {
            return null;
        }

        return new Claims(issuer, issuedAt, expiresAt);
    }

    private static string Base64UrlEncode(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] Base64UrlDecode(string value)
    {
        var padded = value.Replace('-', '+').Replace('_', '/');
        padded += new string('=', (4 - (padded.Length % 4)) % 4);
        return Convert.FromBase64String(padded);
    }
}
