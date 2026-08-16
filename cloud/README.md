# LCARS Cloud

An Azure-hosted companion to the boat: it collects maritime log entries from
the LCARS helm display for analytics, and holds a small reference catalogue of
marinas and anchorages. Everything is kept in one Azure Storage account —
Table Storage for structured records, Blob Storage for anything bulkier.

```
cloud/
  LcarsHelm.Cloud.slnx
  src/
    LcarsHelm.Cloud.Core/   Domain models and the Table/Blob storage layer.
    LcarsHelm.Cloud.Api/    Minimal API: log ingestion, marina/anchorage CRUD.
    LcarsHelm.Cloud.Web/    Blazor Server dashboard, reads straight from Core.
  tests/
    LcarsHelm.Cloud.Tests/  Entity <-> Table Storage mapping tests.
```

The dashboard talks to storage directly through `LcarsHelm.Cloud.Core` rather
than over HTTP to its own API — both run inside the same trust boundary, so
the extra hop would only add latency. The API exists for the boat (and any
other client) to push and query data from outside.

## Requirements

- .NET 10 SDK
- An Azure Storage account, or the [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite)
  emulator for local development

## Configuration

Both `LcarsHelm.Cloud.Api` and `LcarsHelm.Cloud.Web` read a `Storage` section:

| Key                | Meaning                                                                 |
| ------------------ | ------------------------------------------------------------------------ |
| `ConnectionString`  | Local dev only. Set to `UseDevelopmentStorage=true` for Azurite.        |
| `TableServiceUri`   | Production. The account's table endpoint; auth is via managed identity. |
| `BlobServiceUri`    | Production. The account's blob endpoint; auth is via managed identity.  |

`appsettings.Development.json` in both projects is already set to
`UseDevelopmentStorage=true`. In Azure, leave `ConnectionString` empty, set
the two `*ServiceUri` values, and grant the App Service's managed identity the
**Storage Table Data Contributor** and **Storage Blob Data Contributor** roles
on the storage account — no account keys need to leave the account.

## Running locally

```bash
azurite --silent &
dotnet run --project src/LcarsHelm.Cloud.Api
dotnet run --project src/LcarsHelm.Cloud.Web
```

## Tests

```bash
dotnet test LcarsHelm.Cloud.slnx
```
