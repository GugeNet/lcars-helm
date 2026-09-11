using System.Runtime.CompilerServices;
using LcarsHelm.Cloud.Core.Models;
using LcarsHelm.Cloud.Core.Storage;

namespace LcarsHelm.Cloud.Tests;

/// <summary>In-memory stand-ins for the Table/Blob-backed stores, used so the endpoint
/// tests exercise real routing, auth and endpoint logic without needing Azurite.</summary>
public sealed class FakeVesselStore : IVesselStore
{
    private readonly Dictionary<Guid, Vessel> _vessels = [];

    public Task<Vessel> AddAsync(Vessel vessel, CancellationToken cancellationToken = default)
    {
        _vessels[vessel.Id] = vessel;
        return Task.FromResult(vessel);
    }

    public Task<Vessel?> GetAsync(Guid id, CancellationToken cancellationToken = default) =>
        Task.FromResult(_vessels.GetValueOrDefault(id));

    public Task<Vessel?> FindByFingerprintAsync(string publicKeyFingerprint, CancellationToken cancellationToken = default) =>
        Task.FromResult(_vessels.Values.FirstOrDefault(v => v.PublicKeyFingerprint == publicKeyFingerprint));

    public Task<Vessel> UpdateAsync(Vessel vessel, CancellationToken cancellationToken = default)
    {
        _vessels[vessel.Id] = vessel;
        return Task.FromResult(vessel);
    }

    public async IAsyncEnumerable<Vessel> ListAsync([EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        foreach (var vessel in _vessels.Values.ToList())
        {
            yield return vessel;
        }
        await Task.CompletedTask;
    }
}

public sealed class FakeLogUploadStore : ILogUploadStore
{
    private readonly Dictionary<(string VesselId, string FileName), LogUpload> _uploads = [];

    public Task<LogUpload> AddAsync(LogUpload upload, CancellationToken cancellationToken = default)
    {
        _uploads[(upload.VesselId, upload.FileName)] = upload;
        return Task.FromResult(upload);
    }

    public Task<LogUpload?> FindAsync(string vesselId, string fileName, CancellationToken cancellationToken = default) =>
        Task.FromResult(_uploads.GetValueOrDefault((vesselId, fileName)));
}

public sealed class FakeLogEntryStore : ILogEntryStore
{
    public List<LogEntry> Entries { get; } = [];

    public Task AddAsync(LogEntry entry, CancellationToken cancellationToken = default)
    {
        Entries.Add(entry);
        return Task.CompletedTask;
    }

    public Task AddBatchAsync(IReadOnlyCollection<LogEntry> entries, CancellationToken cancellationToken = default)
    {
        Entries.AddRange(entries);
        return Task.CompletedTask;
    }

    public async IAsyncEnumerable<LogEntry> QueryAsync(
        string boatId,
        DateTimeOffset from,
        DateTimeOffset to,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        foreach (var entry in Entries.Where(e => e.BoatId == boatId && e.Timestamp >= from && e.Timestamp <= to).ToList())
        {
            yield return entry;
        }
        await Task.CompletedTask;
    }
}

public sealed class FakeBoatLogArchive : IBoatLogArchive
{
    public List<(string BoatId, string FileName, byte[] Content, string ContentType)> Uploads { get; } = [];

    public async Task<Uri> UploadAsync(
        string boatId,
        string fileName,
        Stream content,
        string contentType,
        CancellationToken cancellationToken = default)
    {
        using var buffer = new MemoryStream();
        await content.CopyToAsync(buffer, cancellationToken);
        Uploads.Add((boatId, fileName, buffer.ToArray(), contentType));
        return new Uri($"https://fake.blob.local/log-archives/{boatId}/{fileName}");
    }
}
