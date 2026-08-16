using System.Runtime.CompilerServices;
using Azure.Data.Tables;
using LcarsHelm.Cloud.Core.Models;
using LcarsHelm.Cloud.Core.Storage.Entities;
using Microsoft.Extensions.Options;

namespace LcarsHelm.Cloud.Core.Storage;

public sealed class TableLogEntryStore : ILogEntryStore
{
    private readonly TableClient _table;
    private readonly Lazy<Task> _ensureTable;

    public TableLogEntryStore(TableServiceClient serviceClient, IOptions<StorageOptions> options)
    {
        _table = serviceClient.GetTableClient(options.Value.LogEntriesTableName);
        _ensureTable = new Lazy<Task>(() => _table.CreateIfNotExistsAsync());
    }

    public async Task AddAsync(LogEntry entry, CancellationToken cancellationToken = default)
    {
        await _ensureTable.Value;
        var entity = LogEntryEntity.FromModel(entry);
        await _table.AddEntityAsync(entity, cancellationToken);
    }

    public async IAsyncEnumerable<LogEntry> QueryAsync(
        string boatId,
        DateTimeOffset from,
        DateTimeOffset to,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        await _ensureTable.Value;

        var fromPartition = LogEntryEntity.BuildPartitionKey(boatId, from);
        var toPartition = LogEntryEntity.BuildPartitionKey(boatId, to);
        var filter = $"PartitionKey ge '{fromPartition}' and PartitionKey le '{toPartition}'";

        await foreach (var entity in _table.QueryAsync<LogEntryEntity>(filter, cancellationToken: cancellationToken))
        {
            if (entity.EntryTimestamp < from || entity.EntryTimestamp > to)
            {
                continue;
            }

            yield return entity.ToModel();
        }
    }
}
