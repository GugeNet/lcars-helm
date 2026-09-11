using Azure;
using Azure.Data.Tables;
using LcarsHelm.Cloud.Core.Models;

namespace LcarsHelm.Cloud.Core.Storage.Entities;

/// <summary>
/// Flat Table Storage projection of <see cref="Vessel"/>. Every vessel lives in the
/// same partition — the fleet is small enough that this never needs sharding, and it
/// keeps "list every vessel for the dashboard" a single partition scan.
/// </summary>
public sealed class VesselEntity : ITableEntity
{
    public const string PartitionKeyValue = "vessel";

    public string PartitionKey { get; set; } = PartitionKeyValue;
    public string RowKey { get; set; } = string.Empty;
    public DateTimeOffset? Timestamp { get; set; }
    public ETag ETag { get; set; }

    public string Name { get; set; } = string.Empty;
    public string PublicKeyPem { get; set; } = string.Empty;
    public string PublicKeyFingerprint { get; set; } = string.Empty;
    public string Status { get; set; } = nameof(VesselStatus.Pending);
    public DateTimeOffset RegisteredAt { get; set; }
    public DateTimeOffset? ApprovedAt { get; set; }
    public DateTimeOffset? LastSeenAt { get; set; }
    public DateTimeOffset? LastUploadAt { get; set; }

    public static VesselEntity FromModel(Vessel vessel) => new()
    {
        RowKey = vessel.Id.ToString("N"),
        Name = vessel.Name,
        PublicKeyPem = vessel.PublicKeyPem,
        PublicKeyFingerprint = vessel.PublicKeyFingerprint,
        Status = vessel.Status.ToString(),
        RegisteredAt = vessel.RegisteredAt,
        ApprovedAt = vessel.ApprovedAt,
        LastSeenAt = vessel.LastSeenAt,
        LastUploadAt = vessel.LastUploadAt,
    };

    public Vessel ToModel() => new()
    {
        Id = Guid.ParseExact(RowKey, "N"),
        Name = Name,
        PublicKeyPem = PublicKeyPem,
        PublicKeyFingerprint = PublicKeyFingerprint,
        Status = Enum.Parse<VesselStatus>(Status),
        RegisteredAt = RegisteredAt,
        ApprovedAt = ApprovedAt,
        LastSeenAt = LastSeenAt,
        LastUploadAt = LastUploadAt,
    };
}
