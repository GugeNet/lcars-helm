namespace LcarsHelm.Cloud.Core.Models;

/// <summary>
/// A boat installation registered to upload logs. Identity is the key pair generated
/// on the Pi at first start — <see cref="PublicKeyPem"/> is what the cloud checks
/// signed upload requests against, never a username or password.
/// </summary>
public sealed record Vessel
{
    public Guid Id { get; init; } = Guid.NewGuid();

    public required string Name { get; init; }

    /// <summary>SPKI PEM of the vessel's ECDSA P-256 public key.</summary>
    public required string PublicKeyPem { get; init; }

    /// <summary>SHA-256 of <see cref="PublicKeyPem"/>, hex-encoded, for fast lookup and de-duplication.</summary>
    public required string PublicKeyFingerprint { get; init; }

    public VesselStatus Status { get; init; } = VesselStatus.Pending;

    public required DateTimeOffset RegisteredAt { get; init; }

    public DateTimeOffset? ApprovedAt { get; init; }

    /// <summary>Last time this vessel authenticated successfully, whether or not the call succeeded.</summary>
    public DateTimeOffset? LastSeenAt { get; init; }

    public DateTimeOffset? LastUploadAt { get; init; }
}
