using LcarsHelm.Cloud.Core.Models;

namespace LcarsHelm.Cloud.Core.Storage;

public interface IAnchorageStore
{
    Task<Anchorage> UpsertAsync(Anchorage anchorage, CancellationToken cancellationToken = default);
    Task<Anchorage?> GetAsync(Guid id, CancellationToken cancellationToken = default);
    Task DeleteAsync(Guid id, CancellationToken cancellationToken = default);
    IAsyncEnumerable<Anchorage> ListAsync(CancellationToken cancellationToken = default);
}
