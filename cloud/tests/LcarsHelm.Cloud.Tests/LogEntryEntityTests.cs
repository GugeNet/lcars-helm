using LcarsHelm.Cloud.Core.Models;
using LcarsHelm.Cloud.Core.Storage.Entities;

namespace LcarsHelm.Cloud.Tests;

public class LogEntryEntityTests
{
    private static LogEntry SampleEntry() => new()
    {
        BoatId = "lcars-helm",
        Timestamp = new DateTimeOffset(2026, 8, 14, 12, 30, 0, TimeSpan.Zero),
        Situation = SituationId.Anchored,
        Position = new Position(59.0518, 10.9337),
        HeadingTrue = 180.5,
        SpeedOverGround = 0.2,
        Wind = new WindReading { SpeedTrue = 12.4, DirectionTrue = 270 },
        Engine = new EngineReading { Running = false },
        Electrical = new ElectricalReading { StateOfCharge = 87.5, ShoreConnected = false },
        Anchor = new AnchorReading
        {
            Deployed = true,
            Position = new Position(59.0519, 10.9338),
            RodeLength = 30,
            AlarmRadius = 45,
        },
        Navigation = new NavigationReading { CrossTrackError = 3.1 },
    };

    [Fact]
    public void RoundTrip_PreservesAllFields()
    {
        var original = SampleEntry();

        var entity = LogEntryEntity.FromModel(original);
        var roundTripped = entity.ToModel();

        Assert.Equal(original.Id, roundTripped.Id);
        Assert.Equal(original.BoatId, roundTripped.BoatId);
        Assert.Equal(original.Timestamp, roundTripped.Timestamp);
        Assert.Equal(original.Situation, roundTripped.Situation);
        Assert.Equal(original.Position, roundTripped.Position);
        Assert.Equal(original.HeadingTrue, roundTripped.HeadingTrue);
        Assert.Equal(original.SpeedOverGround, roundTripped.SpeedOverGround);
        Assert.Equal(original.Wind!.SpeedTrue, roundTripped.Wind!.SpeedTrue);
        Assert.Equal(original.Wind.DirectionTrue, roundTripped.Wind.DirectionTrue);
        Assert.Equal(original.Electrical!.StateOfCharge, roundTripped.Electrical!.StateOfCharge);
        Assert.Equal(original.Anchor!.Deployed, roundTripped.Anchor!.Deployed);
        Assert.Equal(original.Anchor.Position, roundTripped.Anchor.Position);
        Assert.Equal(original.Anchor.RodeLength, roundTripped.Anchor.RodeLength);
        Assert.Equal(original.Navigation!.CrossTrackError, roundTripped.Navigation!.CrossTrackError);
    }

    [Fact]
    public void PartitionKey_GroupsByBoatAndUtcDate()
    {
        var entry = SampleEntry();

        var partitionKey = LogEntryEntity.BuildPartitionKey(entry.BoatId, entry.Timestamp);

        Assert.Equal("lcars-helm_2026-08-14", partitionKey);
    }

    [Fact]
    public void RowKey_SortsNewestFirst()
    {
        var earlier = new DateTimeOffset(2026, 8, 14, 8, 0, 0, TimeSpan.Zero);
        var later = new DateTimeOffset(2026, 8, 14, 20, 0, 0, TimeSpan.Zero);
        var id = Guid.NewGuid();

        var earlierRowKey = LogEntryEntity.BuildRowKey(earlier, id);
        var laterRowKey = LogEntryEntity.BuildRowKey(later, id);

        // Lexicographic ordering must put the later reading first, matching Table
        // Storage's default ascending sort within a partition.
        Assert.True(string.CompareOrdinal(laterRowKey, earlierRowKey) < 0);
    }
}
