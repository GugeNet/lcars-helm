using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using LcarsHelm.Cloud.Api.Auth;
using LcarsHelm.Cloud.Core.Models;

namespace LcarsHelm.Cloud.Tests;

public sealed class LogUploadEndpointTests : IDisposable
{
    private readonly LogsApiFactory _factory = new();
    private readonly HttpClient _client;

    public LogUploadEndpointTests()
    {
        _client = _factory.CreateClient();
    }

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    [Fact]
    public async Task Upload_SucceedsForAnApprovedVessel()
    {
        var (privateKey, publicKeyPem) = NewVesselKey();
        var vesselId = await RegisterAsync(publicKeyPem);
        Approve(vesselId);
        var token = VesselJwt.Mint(vesselId.ToString(), privateKey, TimeSpan.FromMinutes(5));
        var (gzipBytes, sha256) = BuildLogFile(vesselId);

        var response = await _client.SendAsync(BuildUploadRequest(vesselId, token, gzipBytes, sha256));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Single(_factory.Archive.Uploads);
        Assert.Single(_factory.LogEntries.Entries);
        Assert.Equal(vesselId.ToString(), _factory.LogEntries.Entries[0].BoatId);
    }

    [Fact]
    public async Task Upload_IsRejectedForAPendingVessel()
    {
        var (privateKey, publicKeyPem) = NewVesselKey();
        var vesselId = await RegisterAsync(publicKeyPem);
        var token = VesselJwt.Mint(vesselId.ToString(), privateKey, TimeSpan.FromMinutes(5));
        var (gzipBytes, sha256) = BuildLogFile(vesselId);

        var response = await _client.SendAsync(BuildUploadRequest(vesselId, token, gzipBytes, sha256));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("vessel-pending", body.GetProperty("type").GetString());
        Assert.Empty(_factory.Archive.Uploads);
    }

    [Fact]
    public async Task Upload_IsRejectedForARevokedVessel()
    {
        var (privateKey, publicKeyPem) = NewVesselKey();
        var vesselId = await RegisterAsync(publicKeyPem);
        Approve(vesselId);
        SetStatus(vesselId, VesselStatus.Revoked);
        var token = VesselJwt.Mint(vesselId.ToString(), privateKey, TimeSpan.FromMinutes(5));
        var (gzipBytes, sha256) = BuildLogFile(vesselId);

        var response = await _client.SendAsync(BuildUploadRequest(vesselId, token, gzipBytes, sha256));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("vessel-revoked", body.GetProperty("type").GetString());
    }

    [Fact]
    public async Task Upload_WithoutATokenIsUnauthorized()
    {
        var vesselId = Guid.NewGuid();
        var (gzipBytes, sha256) = BuildLogFile(vesselId);
        var request = new HttpRequestMessage(HttpMethod.Post, $"/api/vessels/{vesselId}/logs")
        {
            Content = new ByteArrayContent(gzipBytes)
        };
        request.Headers.Add("X-Log-File", "unused.ndjson.gz");
        request.Headers.Add("X-Content-Sha256", sha256);

        var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Upload_ReuploadingTheSameFileIsIdempotent()
    {
        var (privateKey, publicKeyPem) = NewVesselKey();
        var vesselId = await RegisterAsync(publicKeyPem);
        Approve(vesselId);
        var token = VesselJwt.Mint(vesselId.ToString(), privateKey, TimeSpan.FromMinutes(5));
        var (gzipBytes, sha256) = BuildLogFile(vesselId);

        var first = await _client.SendAsync(BuildUploadRequest(vesselId, token, gzipBytes, sha256));
        var second = await _client.SendAsync(BuildUploadRequest(vesselId, token, gzipBytes, sha256));

        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        // The retry must not have re-run the blob upload or the minute projection.
        Assert.Single(_factory.Archive.Uploads);
        Assert.Single(_factory.LogEntries.Entries);
    }

    [Fact]
    public async Task Upload_RejectsAMismatchedChecksum()
    {
        var (privateKey, publicKeyPem) = NewVesselKey();
        var vesselId = await RegisterAsync(publicKeyPem);
        Approve(vesselId);
        var token = VesselJwt.Mint(vesselId.ToString(), privateKey, TimeSpan.FromMinutes(5));
        var (gzipBytes, _) = BuildLogFile(vesselId);

        var response = await _client.SendAsync(
            BuildUploadRequest(vesselId, token, gzipBytes, new string('0', 64)));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(_factory.Archive.Uploads);
    }

    [Fact]
    public async Task Register_ReRegisteringTheSameKeyReturnsTheExistingVessel()
    {
        var (_, publicKeyPem) = NewVesselKey();

        var first = await RegisterAsync(publicKeyPem, "Cinderella");
        var second = await RegisterAsync(publicKeyPem, "Cinderella");

        Assert.Equal(first, second);
    }

    private static (ECDsa PrivateKey, string PublicKeyPem) NewVesselKey()
    {
        var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        return (key, key.ExportSubjectPublicKeyInfoPem());
    }

    private async Task<Guid> RegisterAsync(string publicKeyPem, string name = "Bench")
    {
        var response = await _client.PostAsJsonAsync("/api/vessels/register", new { name, publicKeyPem });
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        return Guid.Parse(body.GetProperty("vesselId").GetString()!);
    }

    private void Approve(Guid vesselId) => SetStatus(vesselId, VesselStatus.Approved);

    private void SetStatus(Guid vesselId, VesselStatus status)
    {
        var vessel = _factory.Vessels.GetAsync(vesselId).GetAwaiter().GetResult()
            ?? throw new InvalidOperationException("Vessel not seeded.");
        _factory.Vessels.UpdateAsync(vessel with { Status = status }).GetAwaiter().GetResult();
    }

    private static (byte[] Gzip, string Sha256) BuildLogFile(Guid vesselId)
    {
        var ndjson =
            $"{{\"type\":\"header\",\"schema\":1,\"vesselId\":\"{vesselId}\",\"startedAt\":\"2026-09-11T10:00:00.000Z\"}}\n" +
            "{\"t\":\"2026-09-11T10:00:01.000Z\",\"situation\":\"cruising\",\"navigation.headingTrue\":1.0}\n";

        using var raw = new MemoryStream();
        using (var gzip = new GZipStream(raw, CompressionMode.Compress, leaveOpen: true))
        {
            var bytes = Encoding.UTF8.GetBytes(ndjson);
            gzip.Write(bytes, 0, bytes.Length);
        }
        var gzipBytes = raw.ToArray();
        var sha256 = Convert.ToHexString(SHA256.HashData(gzipBytes)).ToLowerInvariant();
        return (gzipBytes, sha256);
    }

    private static HttpRequestMessage BuildUploadRequest(
        Guid vesselId,
        string token,
        byte[] gzipBytes,
        string sha256,
        string? fileName = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, $"/api/vessels/{vesselId}/logs")
        {
            Content = new ByteArrayContent(gzipBytes)
        };
        request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/x-ndjson");
        request.Content.Headers.ContentEncoding.Add("gzip");
        request.Headers.Add("X-Log-File", fileName ?? $"{vesselId}_2026-09-11T10-00-00Z.ndjson.gz");
        request.Headers.Add("X-Content-Sha256", sha256);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return request;
    }
}
