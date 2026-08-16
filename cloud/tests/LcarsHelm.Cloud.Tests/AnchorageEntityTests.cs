using LcarsHelm.Cloud.Core.Models;
using LcarsHelm.Cloud.Core.Storage.Entities;

namespace LcarsHelm.Cloud.Tests;

public class AnchorageEntityTests
{
    [Fact]
    public void RoundTrip_PreservesAllFields()
    {
        var original = new Anchorage
        {
            Name = "Bekkelagsbukta",
            Position = new Position(59.0518, 10.9337),
            HoldingGround = "Mud",
            TypicalDepthMeters = 6.5,
            ShelteredFrom = "N, NE",
            Notes = "Crowded on summer weekends",
        };

        var entity = AnchorageEntity.FromModel(original);
        var roundTripped = entity.ToModel();

        Assert.Equal(original, roundTripped);
        Assert.Equal(AnchorageEntity.PartitionKeyValue, entity.PartitionKey);
        Assert.Equal(original.Id.ToString("N"), entity.RowKey);
    }
}
