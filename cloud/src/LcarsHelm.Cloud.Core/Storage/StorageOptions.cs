namespace LcarsHelm.Cloud.Core.Storage;

/// <summary>
/// Binds to the "Storage" configuration section. In Azure, set ServiceUri and let the
/// app authenticate with its managed identity. Locally, set ConnectionString to
/// "UseDevelopmentStorage=true" to talk to Azurite instead.
/// </summary>
public sealed class StorageOptions
{
    public const string SectionName = "Storage";

    /// <summary>Table/blob account URI, e.g. https://lcarshelm.table.core.windows.net. Used with DefaultAzureCredential.</summary>
    public string? TableServiceUri { get; set; }

    public string? BlobServiceUri { get; set; }

    /// <summary>Connection string for local development (Azurite) or key-based auth. Takes precedence over the URIs when set.</summary>
    public string? ConnectionString { get; set; }

    public string LogEntriesTableName { get; set; } = "LogEntries";
    public string MarinasTableName { get; set; } = "Marinas";
    public string AnchoragesTableName { get; set; } = "Anchorages";
    public string ArchiveContainerName { get; set; } = "log-archives";
}
