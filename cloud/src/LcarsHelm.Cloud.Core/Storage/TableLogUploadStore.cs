using Azure;
using Azure.Data.Tables;
using LcarsHelm.Cloud.Core.Models;
using LcarsHelm.Cloud.Core.Storage.Entities;
using Microsoft.Extensions.Options;

namespace LcarsHelm.Cloud.Core.Storage;

public sealed class TableLogUploadStore : ILogUploadStore
{
    private readonly TableClient _table;
    private readonly Lazy<Task> _ensureTable;

    public TableLogUploadStore(TableServiceClient serviceClient, IOptions<StorageOptions> options)
    {
        _table = serviceClient.GetTableClient(options.Value.LogUploadsTableName);
        _ensureTable = new Lazy<Task>(() => _table.CreateIfNotExistsAsync());
    }

    public async Task<LogUpload> AddAsync(LogUpload upload, CancellationToken cancellationToken = default)
    {
        await _ensureTable.Value;
        var entity = LogUploadEntity.FromModel(upload);
        await _table.AddEntityAsync(entity, cancellationToken);
        return upload;
    }

    public async Task<LogUpload?> FindAsync(string vesselId, string fileName, CancellationToken cancellationToken = default)
    {
        await _ensureTable.Value;
        try
        {
            var response = await _table.GetEntityAsync<LogUploadEntity>(
                vesselId, LogUploadEntity.BuildRowKey(fileName), cancellationToken: cancellationToken);
            return response.Value.ToModel();
        }
        catch (RequestFailedException ex) when (ex.Status == 404)
        {
            return null;
        }
    }
}
