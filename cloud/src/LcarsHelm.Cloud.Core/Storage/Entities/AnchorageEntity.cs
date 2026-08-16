using Azure;
using Azure.Data.Tables;
using LcarsHelm.Cloud.Core.Models;

namespace LcarsHelm.Cloud.Core.Storage.Entities;

public sealed class AnchorageEntity : ITableEntity
{
    public const string PartitionKeyValue = "anchorage";

    public string PartitionKey { get; set; } = PartitionKeyValue;
    public string RowKey { get; set; } = string.Empty;
    public DateTimeOffset? Timestamp { get; set; }
    public ETag ETag { get; set; }

    public string Name { get; set; } = string.Empty;
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public string? HoldingGround { get; set; }
    public double? TypicalDepthMeters { get; set; }
    public string? ShelteredFrom { get; set; }
    public string? Notes { get; set; }

    public static AnchorageEntity FromModel(Anchorage anchorage) => new()
    {
        RowKey = anchorage.Id.ToString("N"),
        Name = anchorage.Name,
        Latitude = anchorage.Position.Latitude,
        Longitude = anchorage.Position.Longitude,
        HoldingGround = anchorage.HoldingGround,
        TypicalDepthMeters = anchorage.TypicalDepthMeters,
        ShelteredFrom = anchorage.ShelteredFrom,
        Notes = anchorage.Notes,
    };

    public Anchorage ToModel() => new()
    {
        Id = Guid.ParseExact(RowKey, "N"),
        Name = Name,
        Position = new Position(Latitude, Longitude),
        HoldingGround = HoldingGround,
        TypicalDepthMeters = TypicalDepthMeters,
        ShelteredFrom = ShelteredFrom,
        Notes = Notes,
    };
}
