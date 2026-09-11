using System.Security.Claims;
using System.Security.Cryptography;
using LcarsHelm.Cloud.Core.Logs;
using LcarsHelm.Cloud.Core.Models;
using LcarsHelm.Cloud.Core.Storage;

namespace LcarsHelm.Cloud.Api.Endpoints;

public sealed record LogUploadResponse(string FileName, int Lines, int ProjectedRows);

public static class LogsEndpoints
{
    public static IEndpointRouteBuilder MapLogsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/vessels/{vesselId:guid}/logs", UploadAsync)
            .RequireAuthorization("ApprovedVessel");

        return app;
    }

    /// <summary>
    /// Accepts one gzip NDJSON log file: the raw bytes go to blob storage unchanged as
    /// the source of truth, and a one-row-per-minute projection goes into
    /// <c>LogEntries</c> so the existing dashboard keeps working without reading the
    /// blob. Re-uploading a file already on record is answered from that record
    /// instead of doing the work twice — the plugin retries whenever it never saw a
    /// response, which is indistinguishable here from the upload having been lost.
    /// </summary>
    private static async Task<IResult> UploadAsync(
        Guid vesselId,
        HttpRequest request,
        ClaimsPrincipal user,
        IVesselStore vessels,
        ILogUploadStore uploads,
        ILogEntryStore logEntries,
        IBoatLogArchive archive,
        CancellationToken ct)
    {
        if (user.FindFirstValue("vesselId") != vesselId.ToString())
        {
            return Results.Forbid();
        }

        if (!request.Headers.TryGetValue("X-Log-File", out var fileNameHeader) ||
            string.IsNullOrWhiteSpace(fileNameHeader))
        {
            return Results.BadRequest("X-Log-File header is required.");
        }
        var fileName = fileNameHeader.ToString();

        if (!request.Headers.TryGetValue("X-Content-Sha256", out var expectedShaHeader) ||
            string.IsNullOrWhiteSpace(expectedShaHeader))
        {
            return Results.BadRequest("X-Content-Sha256 header is required.");
        }
        var expectedSha = expectedShaHeader.ToString();

        // Buffered once: the checksum has to see every byte before anything is
        // trusted, and the same bytes are then read again both to decompress and to
        // archive verbatim.
        using var buffer = new MemoryStream();
        await request.Body.CopyToAsync(buffer, ct);
        var bytes = buffer.ToArray();

        var actualSha = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
        if (!string.Equals(actualSha, expectedSha, StringComparison.OrdinalIgnoreCase))
        {
            return Results.BadRequest("X-Content-Sha256 does not match the uploaded body.");
        }

        var vesselIdString = vesselId.ToString();
        var existing = await uploads.FindAsync(vesselIdString, fileName, ct);
        if (existing is not null)
        {
            if (existing.Sha256 != actualSha)
            {
                return Results.Conflict($"{fileName} was already uploaded with different content.");
            }
            return Results.Ok(new LogUploadResponse(existing.FileName, existing.Lines, existing.ProjectedRows));
        }

        LogFile logFile;
        try
        {
            buffer.Position = 0;
            logFile = await LogFileReader.ReadAsync(buffer, ct);
        }
        catch (InvalidDataException)
        {
            return Results.BadRequest("File content is not valid gzip.");
        }

        var projected = MinuteProjector.Project(vesselIdString, logFile.Samples);
        if (projected.Count > 0)
        {
            await logEntries.AddBatchAsync(projected, ct);
        }

        var blobUri = await archive.UploadAsync(vesselIdString, fileName, new MemoryStream(bytes), "application/gzip", ct);

        var receivedAt = DateTimeOffset.UtcNow;
        var upload = new LogUpload
        {
            VesselId = vesselIdString,
            FileName = fileName,
            Sha256 = actualSha,
            Bytes = bytes.LongLength,
            Lines = logFile.Samples.Count,
            FirstSampleAt = logFile.Samples.Count > 0 ? logFile.Samples[0].Timestamp : null,
            LastSampleAt = logFile.Samples.Count > 0 ? logFile.Samples[^1].Timestamp : null,
            ReceivedAt = receivedAt,
            ProjectedRows = projected.Count,
            BlobUri = blobUri,
        };
        await uploads.AddAsync(upload, ct);

        var vessel = await vessels.GetAsync(vesselId, ct);
        if (vessel is not null)
        {
            await vessels.UpdateAsync(vessel with { LastUploadAt = receivedAt, LastSeenAt = receivedAt }, ct);
        }

        return Results.Created(
            $"/api/vessels/{vesselId}/logs/{fileName}",
            new LogUploadResponse(fileName, upload.Lines, upload.ProjectedRows));
    }
}
