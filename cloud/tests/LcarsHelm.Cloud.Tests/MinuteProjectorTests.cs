using System.Text.Json;
using LcarsHelm.Cloud.Core.Logs;

namespace LcarsHelm.Cloud.Tests;

public class MinuteProjectorTests
{
    private static LogSample SampleAt(string iso, string situation = "cruising", double heading = 1.0)
    {
        var paths = new Dictionary<string, JsonElement>
        {
            ["navigation.headingTrue"] = JsonSerializer.SerializeToElement(heading),
        };
        return new LogSample(DateTimeOffset.Parse(iso), situation, paths);
    }

    [Fact]
    public void Project_KeepsOneRowPerUtcMinute()
    {
        var samples = new[]
        {
            SampleAt("2026-09-11T10:00:01Z", heading: 1.0),
            SampleAt("2026-09-11T10:00:30Z", heading: 2.0),
            SampleAt("2026-09-11T10:00:59Z", heading: 3.0),
            SampleAt("2026-09-11T10:01:00Z", heading: 4.0),
        };

        var projected = MinuteProjector.Project("vessel-1", samples);

        Assert.Equal(2, projected.Count);
    }

    [Fact]
    public void Project_KeepsTheFirstSampleOfEachMinute()
    {
        var samples = new[]
        {
            SampleAt("2026-09-11T10:00:01Z", heading: 1.0),
            SampleAt("2026-09-11T10:00:30Z", heading: 2.0),
        };

        var projected = MinuteProjector.Project("vessel-1", samples);

        Assert.Single(projected);
        Assert.Equal(1.0, projected[0].HeadingTrue);
    }

    [Fact]
    public void Project_OrdersRowsChronologically()
    {
        var samples = new[]
        {
            SampleAt("2026-09-11T10:02:00Z"),
            SampleAt("2026-09-11T10:00:00Z"),
            SampleAt("2026-09-11T10:01:00Z"),
        };

        var projected = MinuteProjector.Project("vessel-1", samples);

        Assert.Equal(3, projected.Count);
        Assert.True(projected[0].Timestamp < projected[1].Timestamp);
        Assert.True(projected[1].Timestamp < projected[2].Timestamp);
    }

    [Fact]
    public void Project_SetsTheBoatIdOnEveryRow()
    {
        var samples = new[] { SampleAt("2026-09-11T10:00:00Z") };

        var projected = MinuteProjector.Project("vessel-42", samples);

        Assert.Equal("vessel-42", projected[0].BoatId);
    }

    [Fact]
    public void Project_ReturnsNothingForNoSamples()
    {
        var projected = MinuteProjector.Project("vessel-1", []);

        Assert.Empty(projected);
    }
}
