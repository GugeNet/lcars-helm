namespace LcarsHelm.Cloud.Core.Models;

public sealed record Marina
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required string Name { get; init; }
    public required Position Position { get; init; }
    public string? VhfChannel { get; init; }
    public bool HasShorePower { get; init; }
    public bool HasFuelDock { get; init; }
    public bool HasWater { get; init; }
    public string? WebsiteUrl { get; init; }
    public string? Notes { get; init; }
}
