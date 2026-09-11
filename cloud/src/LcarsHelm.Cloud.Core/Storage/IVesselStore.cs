using LcarsHelm.Cloud.Core.Models;

namespace LcarsHelm.Cloud.Core.Storage;

public interface IVesselStore
{
    Task<Vessel> AddAsync(Vessel vessel, CancellationToken cancellationToken = default);

    Task<Vessel?> GetAsync(Guid id, CancellationToken cancellationToken = default);

    /// <summary>Used at registration time to make re-registering the same key idempotent.</summary>
    Task<Vessel?> FindByFingerprintAsync(string publicKeyFingerprint, CancellationToken cancellationToken = default);

    Task<Vessel> UpdateAsync(Vessel vessel, CancellationToken cancellationToken = default);

    IAsyncEnumerable<Vessel> ListAsync(CancellationToken cancellationToken = default);
}
