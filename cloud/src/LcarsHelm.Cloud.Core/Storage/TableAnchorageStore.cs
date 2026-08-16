using Azure;
using Azure.Data.Tables;
using LcarsHelm.Cloud.Core.Models;
using LcarsHelm.Cloud.Core.Storage.Entities;
using Microsoft.Extensions.Options;

namespace LcarsHelm.Cloud.Core.Storage;

public sealed class TableAnchorageStore : IAnchorageStore
{
    private readonly TableClient _table;
    private readonly Lazy<Task> _ensureTable;

    public TableAnchorageStore(TableServiceClient serviceClient, IOptions<StorageOptions> options)
    {
        _table = serviceClient.GetTableClient(options.Value.AnchoragesTableName);
        _ensureTable = new Lazy<Task>(() => _table.CreateIfNotExistsAsync());
    }

    public async Task<Anchorage> UpsertAsync(Anchorage anchorage, CancellationToken cancellationToken = default)
    {
        await _ensureTable.Value;
        var entity = AnchorageEntity.FromModel(anchorage);
        await _table.UpsertEntityAsync(entity, cancellationToken: cancellationToken);
        return anchorage;
    }

    public async Task<Anchorage?> GetAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await _ensureTable.Value;
        try
        {
            var response = await _table.GetEntityAsync<AnchorageEntity>(
                AnchorageEntity.PartitionKeyValue, id.ToString("N"), cancellationToken: cancellationToken);
            return response.Value.ToModel();
        }
        catch (RequestFailedException ex) when (ex.Status == 404)
        {
            return null;
        }
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await _ensureTable.Value;
        await _table.DeleteEntityAsync(AnchorageEntity.PartitionKeyValue, id.ToString("N"), cancellationToken: cancellationToken);
    }

    public async IAsyncEnumerable<Anchorage> ListAsync(
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        await _ensureTable.Value;
        await foreach (var entity in _table.QueryAsync<AnchorageEntity>(
            a => a.PartitionKey == AnchorageEntity.PartitionKeyValue, cancellationToken: cancellationToken))
        {
            yield return entity.ToModel();
        }
    }
}
