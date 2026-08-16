using Azure.Data.Tables;
using Azure.Identity;
using Azure.Storage.Blobs;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace LcarsHelm.Cloud.Core.Storage;

public static class ServiceCollectionExtensions
{
    /// <summary>
    /// Registers the Table/Blob storage clients and stores. Reads the "Storage" section:
    /// set ConnectionString for local dev against Azurite ("UseDevelopmentStorage=true"),
    /// or TableServiceUri/BlobServiceUri to authenticate as the app's managed identity in Azure.
    /// </summary>
    public static IServiceCollection AddLcarsCloudStorage(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<StorageOptions>(configuration.GetSection(StorageOptions.SectionName));

        services.AddSingleton(sp =>
        {
            var options = sp.GetRequiredService<IOptions<StorageOptions>>().Value;
            return string.IsNullOrEmpty(options.ConnectionString)
                ? new TableServiceClient(new Uri(RequireUri(options.TableServiceUri, nameof(options.TableServiceUri))), new DefaultAzureCredential())
                : new TableServiceClient(options.ConnectionString);
        });

        services.AddSingleton(sp =>
        {
            var options = sp.GetRequiredService<IOptions<StorageOptions>>().Value;
            return string.IsNullOrEmpty(options.ConnectionString)
                ? new BlobServiceClient(new Uri(RequireUri(options.BlobServiceUri, nameof(options.BlobServiceUri))), new DefaultAzureCredential())
                : new BlobServiceClient(options.ConnectionString);
        });

        services.AddSingleton<ILogEntryStore, TableLogEntryStore>();
        services.AddSingleton<IMarinaStore, TableMarinaStore>();
        services.AddSingleton<IAnchorageStore, TableAnchorageStore>();
        services.AddSingleton<IBoatLogArchive, BlobBoatLogArchive>();

        return services;
    }

    private static string RequireUri(string? uri, string settingName) =>
        uri ?? throw new InvalidOperationException(
            $"Storage:{settingName} must be set when Storage:ConnectionString is not provided.");
}
