using LcarsHelm.Cloud.Core.Models;

namespace LcarsHelm.Cloud.Core.Storage;

public interface ILogEntryStore
{
    Task AddAsync(LogEntry entry, CancellationToken cancellationToken = default);

    /// <summary>Newest-first entries for one boat within a UTC date range.</summary>
    IAsyncEnumerable<LogEntry> QueryAsync(
        string boatId,
        DateTimeOffset from,
        DateTimeOffset to,
        CancellationToken cancellationToken = default);
}
