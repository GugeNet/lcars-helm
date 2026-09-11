# LCARS Cloud

An Azure-hosted companion to the boat: it accepts logs uploaded by any registered
vessel's LCARS helm display, collects them for analytics, and holds a small
reference catalogue of marinas and anchorages. Everything is kept in one Azure
Storage account — Table Storage for structured records, Blob Storage for the raw
uploaded log files.

```
cloud/
  LcarsHelm.Cloud.slnx
  src/
    LcarsHelm.Cloud.Core/   Domain models, the Table/Blob storage layer, and the
                            log file reader/projector shared by the Api.
    LcarsHelm.Cloud.Api/    Minimal API: vessel registration, log ingestion,
                            marina/anchorage CRUD. Public — protected per vessel
                            by its own key, not by a login.
    LcarsHelm.Cloud.Web/    Blazor Server dashboard, reads straight from Core.
                            Approves vessels; must sit behind authentication of
                            its own (see below) since Core has no such gate.
  tests/
    LcarsHelm.Cloud.Tests/  Entity <-> Table Storage mapping tests, the vessel
                            JWT, the log file reader/projector, and
                            WebApplicationFactory tests of the auth + upload
                            endpoints against in-memory fakes.
```

The dashboard talks to storage directly through `LcarsHelm.Cloud.Core` rather
than over HTTP to its own API — both run inside the same trust boundary, so
the extra hop would only add latency. The API exists for a boat (any number of
them, each its own vessel) to register and push logs from outside.

## Vessel registration and approval

Each boat's `lcars-helm` Signal K plugin generates an ECDSA P-256 key pair on
its own, the first time it starts — see `webapp/plugin/vesselKey.ts`. The
private key never leaves the Pi; every authenticated request instead carries a
short-lived JWT signed with it (`Authorization: Bearer …`, scheme `VesselKey`,
verified in `Auth/VesselKeyAuthenticationHandler.cs` against the public key the
vessel registered with — no shared secret, no user login).

1. `POST /api/vessels/register {name, publicKeyPem}` — anonymous, rate-limited.
   Creates the vessel `Pending`, or returns the existing one if this public key
   has registered before (so a Pi that lost its local `vessel.json` but kept its
   key file recovers its identity rather than piling up duplicates).
2. A person opens the **Vessels** page in the dashboard and clicks **Approve**.
   This is the only path to `Approved` — there is deliberately no way for a
   vessel to approve itself, however plausible its key.
3. `POST /api/vessels/{id}/logs` (policy `ApprovedVessel`) now accepts uploads.
   A `Pending` or `Revoked` vessel gets `403` with a body naming which
   (`vessel-pending` / `vessel-revoked`), not a bare Forbidden — the plugin reads
   that to know when to stop retrying so often and when to check again.
4. `GET /api/vessels/me` reports a vessel's own id/name/status, for any
   registered vessel regardless of approval.

**The dashboard itself has no authentication of its own**, so the Approve button
is only as safe as whatever sits in front of `LcarsHelm.Cloud.Web`. In Azure,
enable **App Service Authentication** ("Easy Auth") with Microsoft Entra on the
**Web** app, set to require authentication — do **not** enable it on the **Api**
app, which must stay reachable by boats with no user identity at all and is
protected per-vessel by the scheme above instead.

## Log ingestion

`POST /api/vessels/{id}/logs`, body the gzip NDJSON file the plugin wrote
(`Content-Encoding: gzip`), headers `X-Log-File` (the file name) and
`X-Content-Sha256` (checked against the body before anything else happens).
The raw bytes are archived to Blob Storage unchanged as the source of truth
(`{vessel id}/{file name}` under the `log-archives` container); a one-row-per-
minute projection — see `LcarsHelm.Cloud.Core.Logs.MinuteProjector` — lands in
the `LogEntries` table so the dashboard's "latest reading" keeps working without
reading blobs. Re-uploading a file already on record (same name, same checksum)
is answered from that record rather than re-done — the plugin's own retry after
a lost response looks identical to a genuine resend, and both must be safe.

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

Tables used: `LogEntries`, `Marinas`, `Anchorages`, `Vessels`, `LogUploads`
(names configurable under `Storage`, see `StorageOptions`). Blob container:
`log-archives`. All are created on first use — nothing to provision by hand.

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

`LcarsHelm.Cloud.Api.http` has worked examples for registering a vessel and
uploading a log file once you have a token — see `webapp/plugin/vesselKey.ts`
for how the plugin mints one, or `VesselJwtTests` for a minimal C# example.

## Tests

```bash
dotnet test LcarsHelm.Cloud.slnx
```
