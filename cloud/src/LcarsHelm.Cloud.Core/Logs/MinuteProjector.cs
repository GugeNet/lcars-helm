using LcarsHelm.Cloud.Core.Models;

namespace LcarsHelm.Cloud.Core.Logs;

/// <summary>
/// Projects a log file's full-resolution samples down to one row per UTC minute —
/// enough to keep the existing dashboard's "latest reading" working without writing
/// every sample. At 1 Hz a full sailing day is ~86,000 samples per vessel; the raw
/// file in blob storage is the source of truth for anything needing that resolution.
/// </summary>
public static class MinuteProjector
{
    public static IReadOnlyList<LogEntry> Project(string boatId, IEnumerable<LogSample> samples)
    {
        var byMinute = new SortedDictionary<DateTimeOffset, LogSample>();

        foreach (var sample in samples)
        {
            var minute = FloorToMinute(sample.Timestamp);
            // First sample of the minute wins; later ones in the same minute add
            // nothing a once-a-minute row needs.
            if (!byMinute.ContainsKey(minute))
            {
                byMinute[minute] = sample;
            }
        }

        return byMinute.Values.Select(sample => SampleMapper.ToLogEntry(boatId, sample)).ToList();
    }

    private static DateTimeOffset FloorToMinute(DateTimeOffset timestamp)
    {
        var utc = timestamp.ToUniversalTime();
        return new DateTimeOffset(utc.Year, utc.Month, utc.Day, utc.Hour, utc.Minute, 0, TimeSpan.Zero);
    }
}
