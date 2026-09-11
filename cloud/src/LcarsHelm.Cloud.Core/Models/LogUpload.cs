namespace LcarsHelm.Cloud.Core.Models;

/// <summary>
/// Record of one uploaded log file. Kept mainly so a re-sent file (a Pi that upload
/// succeeded on but never heard the response) can be recognised and answered with the
/// same result instead of being double-counted.
/// </summary>
public sealed record LogUpload
{
    public required string VesselId { get; init; }

    public required string FileName { get; init; }

    /// <summary>SHA-256 of the uploaded (gzip) bytes, hex-encoded.</summary>
    public required string Sha256 { get; init; }

    public required long Bytes { get; init; }

    public required int Lines { get; init; }

    public DateTimeOffset? FirstSampleAt { get; init; }

    public DateTimeOffset? LastSampleAt { get; init; }

    public required DateTimeOffset ReceivedAt { get; init; }

    /// <summary>How many one-per-minute rows this file contributed to <c>LogEntries</c>.</summary>
    public required int ProjectedRows { get; init; }

    /// <summary>Where the raw file lives in blob storage.</summary>
    public required Uri BlobUri { get; init; }
}
