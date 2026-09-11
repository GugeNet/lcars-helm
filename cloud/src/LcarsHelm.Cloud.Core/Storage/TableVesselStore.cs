using Azure;
using Azure.Data.Tables;
using LcarsHelm.Cloud.Core.Models;
using LcarsHelm.Cloud.Core.Storage.Entities;
using Microsoft.Extensions.Options;

namespace LcarsHelm.Cloud.Core.Storage;

public sealed class TableVesselStore : IVesselStore
{
    private readonly TableClient _table;
    private readonly Lazy<Task> _ensureTable;

    public TableVesselStore(TableServiceClient serviceClient, IOptions<StorageOptions> options)
    {
        _table = serviceClient.GetTableClient(options.Value.VesselsTableName);
        _ensureTable = new Lazy<Task>(() => _table.CreateIfNotExistsAsync());
    }

    public async Task<Vessel> AddAsync(Vessel vessel, CancellationToken cancellationToken = default)
    {
        await _ensureTable.Value;
        var entity = VesselEntity.FromModel(vessel);
        await _table.AddEntityAsync(entity, cancellationToken);
        return vessel;
    }

    public async Task<Vessel?> GetAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await _ensureTable.Value;
        try
        {
            var response = await _table.GetEntityAsync<VesselEntity>(
                VesselEntity.PartitionKeyValue, id.ToString("N"), cancellationToken: cancellationToken);
            return response.Value.ToModel();
        }
        catch (RequestFailedException ex) when (ex.Status == 404)
        {
            return null;
        }
    }

    public async Task<Vessel?> FindByFingerprintAsync(string publicKeyFingerprint, CancellationToken cancellationToken = default)
    {
        await _ensureTable.Value;
        await foreach (var entity in _table.QueryAsync<VesselEntity>(
            v => v.PartitionKey == VesselEntity.PartitionKeyValue && v.PublicKeyFingerprint == publicKeyFingerprint,
            cancellationToken: cancellationToken))
        {
            return entity.ToModel();
        }
        return null;
    }

    public async Task<Vessel> UpdateAsync(Vessel vessel, CancellationToken cancellationToken = default)
    {
        await _ensureTable.Value;
        var entity = VesselEntity.FromModel(vessel);
        await _table.UpsertEntityAsync(entity, cancellationToken: cancellationToken);
        return vessel;
    }

    public async IAsyncEnumerable<Vessel> ListAsync(
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        await _ensureTable.Value;
        await foreach (var entity in _table.QueryAsync<VesselEntity>(
            v => v.PartitionKey == VesselEntity.PartitionKeyValue, cancellationToken: cancellationToken))
        {
            yield return entity.ToModel();
        }
    }
}
