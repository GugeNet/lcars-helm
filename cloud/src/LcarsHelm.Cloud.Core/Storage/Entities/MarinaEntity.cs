using Azure;
using Azure.Data.Tables;
using LcarsHelm.Cloud.Core.Models;

namespace LcarsHelm.Cloud.Core.Storage.Entities;

public sealed class MarinaEntity : ITableEntity
{
    public const string PartitionKeyValue = "marina";

    public string PartitionKey { get; set; } = PartitionKeyValue;
    public string RowKey { get; set; } = string.Empty;
    public DateTimeOffset? Timestamp { get; set; }
    public ETag ETag { get; set; }

    public string Name { get; set; } = string.Empty;
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public string? VhfChannel { get; set; }
    public bool HasShorePower { get; set; }
    public bool HasFuelDock { get; set; }
    public bool HasWater { get; set; }
    public string? WebsiteUrl { get; set; }
    public string? Notes { get; set; }

    public static MarinaEntity FromModel(Marina marina) => new()
    {
        RowKey = marina.Id.ToString("N"),
        Name = marina.Name,
        Latitude = marina.Position.Latitude,
        Longitude = marina.Position.Longitude,
        VhfChannel = marina.VhfChannel,
        HasShorePower = marina.HasShorePower,
        HasFuelDock = marina.HasFuelDock,
        HasWater = marina.HasWater,
        WebsiteUrl = marina.WebsiteUrl,
        Notes = marina.Notes,
    };

    public Marina ToModel() => new()
    {
        Id = Guid.ParseExact(RowKey, "N"),
        Name = Name,
        Position = new Position(Latitude, Longitude),
        VhfChannel = VhfChannel,
        HasShorePower = HasShorePower,
        HasFuelDock = HasFuelDock,
        HasWater = HasWater,
        WebsiteUrl = WebsiteUrl,
        Notes = Notes,
    };
}
