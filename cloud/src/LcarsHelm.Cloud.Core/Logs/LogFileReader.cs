using System.IO.Compression;
using System.Text.Json;

namespace LcarsHelm.Cloud.Core.Logs;

/// <summary>The first line of a log file, identifying which vessel and software wrote it.</summary>
public sealed record LogFileHeader(string VesselId, string? VesselName, string? Software, DateTimeOffset StartedAt);

/// <summary>
/// One combined instrument snapshot. <see cref="Paths"/> holds every Signal K path that
/// was fresh at the moment of the tick, keyed exactly as the plugin wrote it (e.g.
/// <c>navigation.headingTrue</c>) — see webapp/src/signalk/paths.ts for the full set.
/// </summary>
public sealed record LogSample(DateTimeOffset Timestamp, string? Situation, IReadOnlyDictionary<string, JsonElement> Paths);

public sealed record LogFile(LogFileHeader? Header, IReadOnlyList<LogSample> Samples);

/// <summary>
/// Reads an uploaded log file: gzip-compressed NDJSON, an optional header line,
/// followed by one snapshot per line. Tolerant of a torn line — the plugin can be
/// killed mid-write, and dropping one bad line is far better than rejecting the
/// whole upload.
/// </summary>
public static class LogFileReader
{
    public static async Task<LogFile> ReadAsync(Stream gzipContent, CancellationToken cancellationToken = default)
    {
        using var gzip = new GZipStream(gzipContent, CompressionMode.Decompress);
        using var reader = new StreamReader(gzip);

        LogFileHeader? header = null;
        var samples = new List<LogSample>();

        string? line;
        while ((line = await reader.ReadLineAsync(cancellationToken)) is not null)
        {
            if (line.Length == 0) continue;

            var sample = ParseLine(line, ref header);
            if (sample is not null) samples.Add(sample);
        }

        return new LogFile(header, samples);
    }

    private static LogSample? ParseLine(string line, ref LogFileHeader? header)
    {
        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(line);
        }
        catch (JsonException)
        {
            // Either the torn final line of a file the plugin was writing when it was
            // killed, or a corrupt one somewhere in the middle. Either way, one bad
            // line should not sink the rest of a day's log.
            return null;
        }

        using (document)
        {
            var root = document.RootElement;

            if (header is null && root.TryGetProperty("type", out var type) && type.GetString() == "header")
            {
                header = ReadHeader(root);
                return null;
            }

            if (!root.TryGetProperty("t", out var timestampProperty)) return null;

            DateTimeOffset timestamp;
            try
            {
                timestamp = timestampProperty.GetDateTimeOffset();
            }
            catch (FormatException)
            {
                return null;
            }

            var situation = root.TryGetProperty("situation", out var situationProperty)
                ? situationProperty.GetString()
                : null;

            var paths = new Dictionary<string, JsonElement>();
            foreach (var property in root.EnumerateObject())
            {
                if (property.NameEquals("t") || property.NameEquals("situation")) continue;
                // Clone detaches the element from the document, which is disposed as
                // soon as this line has been read.
                paths[property.Name] = property.Value.Clone();
            }

            return new LogSample(timestamp, situation, paths);
        }
    }

    private static LogFileHeader ReadHeader(JsonElement root) => new(
        root.TryGetProperty("vesselId", out var id) ? id.GetString() ?? string.Empty : string.Empty,
        root.TryGetProperty("vesselName", out var name) ? name.GetString() : null,
        root.TryGetProperty("software", out var software) ? software.GetString() : null,
        root.TryGetProperty("startedAt", out var startedAt) ? startedAt.GetDateTimeOffset() : default);
}
