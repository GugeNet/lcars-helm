using Azure.Storage.Blobs;
using Microsoft.Extensions.Options;

namespace LcarsHelm.Cloud.Core.Storage;

public sealed class BlobBoatLogArchive : IBoatLogArchive
{
    private readonly BlobContainerClient _container;
    private readonly Lazy<Task> _ensureContainer;

    public BlobBoatLogArchive(BlobServiceClient serviceClient, IOptions<StorageOptions> options)
    {
        _container = serviceClient.GetBlobContainerClient(options.Value.ArchiveContainerName);
        _ensureContainer = new Lazy<Task>(() => _container.CreateIfNotExistsAsync());
    }

    public async Task<Uri> UploadAsync(
        string boatId,
        string fileName,
        Stream content,
        string contentType,
        CancellationToken cancellationToken = default)
    {
        await _ensureContainer.Value;

        var blobName = $"{boatId}/{fileName}";
        var blob = _container.GetBlobClient(blobName);
        await blob.UploadAsync(
            content,
            new Azure.Storage.Blobs.Models.BlobHttpHeaders { ContentType = contentType },
            cancellationToken: cancellationToken);

        return blob.Uri;
    }
}
