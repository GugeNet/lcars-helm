using System.Threading.RateLimiting;
using LcarsHelm.Cloud.Api.Auth;
using LcarsHelm.Cloud.Api.Endpoints;
using LcarsHelm.Cloud.Core.Models;
using LcarsHelm.Cloud.Core.Storage;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

// The upload endpoint takes a whole gzip log file in one request; Kestrel's 30 MB
// default would reject a busy sailing day's file well before the plugin's own
// 500 MB outbox cap ever kicks in.
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 50 * 1024 * 1024);

builder.Services.AddOpenApi();
builder.Services.AddLcarsCloudStorage(builder.Configuration);
builder.Services.AddMemoryCache();

builder.Services
    .AddAuthentication(VesselKeyAuthenticationHandler.SchemeName)
    .AddScheme<VesselKeyAuthenticationSchemeOptions, VesselKeyAuthenticationHandler>(
        VesselKeyAuthenticationHandler.SchemeName, _ => { });

builder.Services.AddAuthorizationBuilder()
    .AddPolicy("ApprovedVessel", policy => policy
        .RequireAuthenticatedUser()
        .RequireClaim("vesselStatus", nameof(VesselStatus.Approved)));

// Swaps the default 403 body for one that says whether the vessel is pending
// approval or has been revoked, rather than a bare Forbidden a Pi would retry
// forever without anyone finding out why.
builder.Services.AddSingleton<IAuthorizationMiddlewareResultHandler, VesselAuthorizationResultHandler>();

builder.Services.AddRateLimiter(options =>
{
    // Per source IP, not global: registration is anonymous, so this is the only
    // thing standing between the endpoint and someone trying to enumerate or spam it.
    options.AddPolicy("register", httpContext => RateLimitPartition.GetFixedWindowLimiter(
        partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        factory: _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 10,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        }));
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapVesselsEndpoints();
app.MapLogsEndpoints();

var logEntries = app.MapGroup("/api/log-entries").WithTags("LogEntries");

logEntries.MapPost("/", async (LogEntry entry, ILogEntryStore store, CancellationToken ct) =>
{
    await store.AddAsync(entry, ct);
    return Results.Created($"/api/log-entries/{entry.Id}", entry);
});

logEntries.MapGet("/", async (string boatId, DateTimeOffset from, DateTimeOffset to, ILogEntryStore store, CancellationToken ct) =>
{
    var results = new List<LogEntry>();
    await foreach (var entry in store.QueryAsync(boatId, from, to, ct))
    {
        results.Add(entry);
    }

    return Results.Ok(results);
});

var marinas = app.MapGroup("/api/marinas").WithTags("Marinas");

marinas.MapGet("/", async (IMarinaStore store, CancellationToken ct) =>
{
    var results = new List<Marina>();
    await foreach (var marina in store.ListAsync(ct))
    {
        results.Add(marina);
    }

    return Results.Ok(results);
});

marinas.MapGet("/{id:guid}", async (Guid id, IMarinaStore store, CancellationToken ct) =>
    await store.GetAsync(id, ct) is { } marina ? Results.Ok(marina) : Results.NotFound());

marinas.MapPost("/", async (Marina marina, IMarinaStore store, CancellationToken ct) =>
{
    var saved = await store.UpsertAsync(marina, ct);
    return Results.Created($"/api/marinas/{saved.Id}", saved);
});

marinas.MapPut("/{id:guid}", async (Guid id, Marina marina, IMarinaStore store, CancellationToken ct) =>
{
    if (id != marina.Id)
    {
        return Results.BadRequest("Route id must match body id.");
    }

    return Results.Ok(await store.UpsertAsync(marina, ct));
});

marinas.MapDelete("/{id:guid}", async (Guid id, IMarinaStore store, CancellationToken ct) =>
{
    await store.DeleteAsync(id, ct);
    return Results.NoContent();
});

var anchorages = app.MapGroup("/api/anchorages").WithTags("Anchorages");

anchorages.MapGet("/", async (IAnchorageStore store, CancellationToken ct) =>
{
    var results = new List<Anchorage>();
    await foreach (var anchorage in store.ListAsync(ct))
    {
        results.Add(anchorage);
    }

    return Results.Ok(results);
});

anchorages.MapGet("/{id:guid}", async (Guid id, IAnchorageStore store, CancellationToken ct) =>
    await store.GetAsync(id, ct) is { } anchorage ? Results.Ok(anchorage) : Results.NotFound());

anchorages.MapPost("/", async (Anchorage anchorage, IAnchorageStore store, CancellationToken ct) =>
{
    var saved = await store.UpsertAsync(anchorage, ct);
    return Results.Created($"/api/anchorages/{saved.Id}", saved);
});

anchorages.MapPut("/{id:guid}", async (Guid id, Anchorage anchorage, IAnchorageStore store, CancellationToken ct) =>
{
    if (id != anchorage.Id)
    {
        return Results.BadRequest("Route id must match body id.");
    }

    return Results.Ok(await store.UpsertAsync(anchorage, ct));
});

anchorages.MapDelete("/{id:guid}", async (Guid id, IAnchorageStore store, CancellationToken ct) =>
{
    await store.DeleteAsync(id, ct);
    return Results.NoContent();
});

app.Run();

// Top-level statements emit a `Program` type into the global namespace but keep it
// internal; this partial declaration is the standard way to give the test project's
// WebApplicationFactory<Program> something to see.
public partial class Program;
