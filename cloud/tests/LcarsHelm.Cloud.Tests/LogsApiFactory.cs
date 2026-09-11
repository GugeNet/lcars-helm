using LcarsHelm.Cloud.Core.Storage;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace LcarsHelm.Cloud.Tests;

/// <summary>
/// Boots the real Api pipeline — routing, the VesselKey auth handler, the
/// ApprovedVessel policy and its custom 403 body — against in-memory fakes instead
/// of Azure Storage, so the endpoint tests need no Azurite.
/// </summary>
public sealed class LogsApiFactory : WebApplicationFactory<Program>
{
    public FakeVesselStore Vessels { get; } = new();
    public FakeLogUploadStore Uploads { get; } = new();
    public FakeLogEntryStore LogEntries { get; } = new();
    public FakeBoatLogArchive Archive { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureAppConfiguration((_, config) =>
        {
            // Storage:ConnectionString still has to parse cleanly for
            // AddLcarsCloudStorage's client factories to construct — the fakes
            // registered below mean those clients are never actually called.
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Storage:ConnectionString"] = "UseDevelopmentStorage=true",
            });
        });

        builder.ConfigureServices(services =>
        {
            // Registered after Program.cs's own AddLcarsCloudStorage call, so these
            // are the ones actually resolved — .NET's container returns the last
            // registration for a single-instance injection.
            services.AddSingleton<IVesselStore>(Vessels);
            services.AddSingleton<ILogUploadStore>(Uploads);
            services.AddSingleton<ILogEntryStore>(LogEntries);
            services.AddSingleton<IBoatLogArchive>(Archive);
        });
    }
}
