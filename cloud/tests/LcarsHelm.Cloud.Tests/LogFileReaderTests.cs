using System.IO.Compression;
using System.Text;
using LcarsHelm.Cloud.Core.Logs;

namespace LcarsHelm.Cloud.Tests;

public class LogFileReaderTests
{
    private static MemoryStream Gzip(string ndjson)
    {
        var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionMode.Compress, leaveOpen: true))
        {
            var bytes = Encoding.UTF8.GetBytes(ndjson);
            gzip.Write(bytes, 0, bytes.Length);
        }
        output.Position = 0;
        return output;
    }

    private const string SampleFile =
        """
        {"type":"header","schema":1,"vesselId":"11111111-1111-1111-1111-111111111111","vesselName":"Cinderella","software":"lcars-helm 0.2.0","startedAt":"2026-09-11T10:00:00.000Z"}
        {"t":"2026-09-11T10:00:01.000Z","situation":"racing","navigation.headingTrue":3.10,"navigation.speedThroughWater":3.3}
        {"t":"2026-09-11T10:00:02.000Z","situation":"racing","navigation.headingTrue":3.12,"navigation.speedThroughWater":3.4}

        """;

    [Fact]
    public async Task ReadAsync_ParsesTheHeaderAndEverySample()
    {
        using var gz = Gzip(SampleFile);

        var file = await LogFileReader.ReadAsync(gz);

        Assert.NotNull(file.Header);
        Assert.Equal("11111111-1111-1111-1111-111111111111", file.Header!.VesselId);
        Assert.Equal("Cinderella", file.Header.VesselName);
        Assert.Equal(2, file.Samples.Count);
        Assert.Equal("racing", file.Samples[0].Situation);
        Assert.Equal(3.3, ((System.Text.Json.JsonElement)file.Samples[0].Paths["navigation.speedThroughWater"]).GetDouble());
    }

    [Fact]
    public async Task ReadAsync_DropsATornFinalLine()
    {
        // Simulates the plugin being killed mid-write: the last line is an
        // incomplete JSON fragment, exactly as a partially-flushed write would leave
        // it. The file should still yield everything before it.
        var torn = SampleFile.TrimEnd('\n') + "\n{\"t\":\"2026-09-11T10:00:03.000Z\",\"navigation.headi";
        using var gz = Gzip(torn);

        var file = await LogFileReader.ReadAsync(gz);

        Assert.Equal(2, file.Samples.Count);
    }

    [Fact]
    public async Task ReadAsync_IgnoresBlankLines()
    {
        using var gz = Gzip("\n" + SampleFile + "\n\n");

        var file = await LogFileReader.ReadAsync(gz);

        Assert.Equal(2, file.Samples.Count);
    }

    [Fact]
    public async Task ReadAsync_HandlesAFileWithNoHeader()
    {
        var noHeader = string.Join(
            "\n",
            SampleFile.Split('\n').Where(line => !line.Contains("\"type\":\"header\"")));
        using var gz = Gzip(noHeader);

        var file = await LogFileReader.ReadAsync(gz);

        Assert.Null(file.Header);
        Assert.Equal(2, file.Samples.Count);
    }
}
