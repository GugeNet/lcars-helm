using LcarsHelm.Cloud.Core.Models;

namespace LcarsHelm.Cloud.Core.Storage;

public interface IMarinaStore
{
    Task<Marina> UpsertAsync(Marina marina, CancellationToken cancellationToken = default);
    Task<Marina?> GetAsync(Guid id, CancellationToken cancellationToken = default);
    Task DeleteAsync(Guid id, CancellationToken cancellationToken = default);
    IAsyncEnumerable<Marina> ListAsync(CancellationToken cancellationToken = default);
}
