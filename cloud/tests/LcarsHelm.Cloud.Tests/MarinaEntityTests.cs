using LcarsHelm.Cloud.Core.Models;
using LcarsHelm.Cloud.Core.Storage.Entities;

namespace LcarsHelm.Cloud.Tests;

public class MarinaEntityTests
{
    [Fact]
    public void RoundTrip_PreservesAllFields()
    {
        var original = new Marina
        {
            Name = "Aker Brygge Marina",
            Position = new Position(59.9095, 10.7280),
            VhfChannel = "12",
            HasShorePower = true,
            HasFuelDock = false,
            HasWater = true,
            WebsiteUrl = "https://example.com",
            Notes = "Book ahead in July",
        };

        var entity = MarinaEntity.FromModel(original);
        var roundTripped = entity.ToModel();

        Assert.Equal(original, roundTripped);
        Assert.Equal(MarinaEntity.PartitionKeyValue, entity.PartitionKey);
        Assert.Equal(original.Id.ToString("N"), entity.RowKey);
    }
}
