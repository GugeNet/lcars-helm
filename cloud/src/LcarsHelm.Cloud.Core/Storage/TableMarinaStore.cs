using Azure;
using Azure.Data.Tables;
using LcarsHelm.Cloud.Core.Models;
using LcarsHelm.Cloud.Core.Storage.Entities;
using Microsoft.Extensions.Options;

namespace LcarsHelm.Cloud.Core.Storage;

public sealed class TableMarinaStore : IMarinaStore
{
    private readonly TableClient _table;
    private readonly Lazy<Task> _ensureTable;

    public TableMarinaStore(TableServiceClient serviceClient, IOptions<StorageOptions> options)
    {
        _table = serviceClient.GetTableClient(options.Value.MarinasTableName);
        _ensureTable = new Lazy<Task>(() => _table.CreateIfNotExistsAsync());
    }

    public async Task<Marina> UpsertAsync(Marina marina, CancellationToken cancellationToken = default)
    {
        await _ensureTable.Value;
        var entity = MarinaEntity.FromModel(marina);
        await _table.UpsertEntityAsync(entity, cancellationToken: cancellationToken);
        return marina;
    }

    public async Task<Marina?> GetAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await _ensureTable.Value;
        try
        {
            var response = await _table.GetEntityAsync<MarinaEntity>(
                MarinaEntity.PartitionKeyValue, id.ToString("N"), cancellationToken: cancellationToken);
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
        await _table.DeleteEntityAsync(MarinaEntity.PartitionKeyValue, id.ToString("N"), cancellationToken: cancellationToken);
    }

    public async IAsyncEnumerable<Marina> ListAsync(
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        await _ensureTable.Value;
        await foreach (var entity in _table.QueryAsync<MarinaEntity>(
            m => m.PartitionKey == MarinaEntity.PartitionKeyValue, cancellationToken: cancellationToken))
        {
            yield return entity.ToModel();
        }
    }
}
