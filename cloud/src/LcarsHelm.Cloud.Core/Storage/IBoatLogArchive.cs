namespace LcarsHelm.Cloud.Core.Storage;

/// <summary>
/// Blob storage for bulk artifacts that don't belong as Table Storage columns,
/// e.g. a day's raw NDJSON log dump or an anchor-watch swing track.
/// </summary>
public interface IBoatLogArchive
{
    Task<Uri> UploadAsync(
        string boatId,
        string fileName,
        Stream content,
        string contentType,
        CancellationToken cancellationToken = default);
}
