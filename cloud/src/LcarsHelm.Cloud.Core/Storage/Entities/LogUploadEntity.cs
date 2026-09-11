using Azure;
using Azure.Data.Tables;
using LcarsHelm.Cloud.Core.Models;

namespace LcarsHelm.Cloud.Core.Storage.Entities;

/// <summary>
/// Flat Table Storage projection of <see cref="LogUpload"/>, one partition per vessel
/// so "has this vessel already sent this file" is a single point lookup by file name.
/// </summary>
public sealed class LogUploadEntity : ITableEntity
{
    public string PartitionKey { get; set; } = string.Empty;
    public string RowKey { get; set; } = string.Empty;
    public DateTimeOffset? Timestamp { get; set; }
    public ETag ETag { get; set; }

    public string Sha256 { get; set; } = string.Empty;
    public long Bytes { get; set; }
    public int Lines { get; set; }
    public DateTimeOffset? FirstSampleAt { get; set; }
    public DateTimeOffset? LastSampleAt { get; set; }
    public DateTimeOffset ReceivedAt { get; set; }
    public int ProjectedRows { get; set; }
    public string BlobUri { get; set; } = string.Empty;

    public static string BuildRowKey(string fileName) => fileName;

    public static LogUploadEntity FromModel(LogUpload upload) => new()
    {
        PartitionKey = upload.VesselId,
        RowKey = BuildRowKey(upload.FileName),
        Sha256 = upload.Sha256,
        Bytes = upload.Bytes,
        Lines = upload.Lines,
        FirstSampleAt = upload.FirstSampleAt,
        LastSampleAt = upload.LastSampleAt,
        ReceivedAt = upload.ReceivedAt,
        ProjectedRows = upload.ProjectedRows,
        BlobUri = upload.BlobUri.ToString(),
    };

    public LogUpload ToModel() => new()
    {
        VesselId = PartitionKey,
        FileName = RowKey,
        Sha256 = Sha256,
        Bytes = Bytes,
        Lines = Lines,
        FirstSampleAt = FirstSampleAt,
        LastSampleAt = LastSampleAt,
        ReceivedAt = ReceivedAt,
        ProjectedRows = ProjectedRows,
        BlobUri = new Uri(BlobUri),
    };
}
