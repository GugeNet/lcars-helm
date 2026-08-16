using LcarsHelm.Cloud.Core.Models;
using LcarsHelm.Cloud.Core.Storage;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddLcarsCloudStorage(builder.Configuration);

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

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
