using LcarsHelm.Cloud.Core.Models;

namespace LcarsHelm.Cloud.Core.Storage;

public interface ILogUploadStore
{
    Task<LogUpload> AddAsync(LogUpload upload, CancellationToken cancellationToken = default);

    /// <summary>Null when this vessel has never uploaded a file with this name.</summary>
    Task<LogUpload?> FindAsync(string vesselId, string fileName, CancellationToken cancellationToken = default);
}
