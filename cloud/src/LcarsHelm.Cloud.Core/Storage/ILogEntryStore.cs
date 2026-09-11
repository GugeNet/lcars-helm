using LcarsHelm.Cloud.Core.Models;

namespace LcarsHelm.Cloud.Core.Storage;

public interface ILogEntryStore
{
    Task AddAsync(LogEntry entry, CancellationToken cancellationToken = default);

    /// <summary>
    /// Inserts many entries at once, e.g. the one-per-minute projection of an uploaded
    /// log file. Entries are grouped by their Table Storage partition (boat + UTC day)
    /// and submitted as batched transactions, so this is far cheaper than one
    /// <see cref="AddAsync"/> per row.
    /// </summary>
    Task AddBatchAsync(IReadOnlyCollection<LogEntry> entries, CancellationToken cancellationToken = default);

    /// <summary>Newest-first entries for one boat within a UTC date range.</summary>
    IAsyncEnumerable<LogEntry> QueryAsync(
        string boatId,
        DateTimeOffset from,
        DateTimeOffset to,
        CancellationToken cancellationToken = default);
}
