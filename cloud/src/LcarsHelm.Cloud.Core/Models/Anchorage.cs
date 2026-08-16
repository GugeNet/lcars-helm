namespace LcarsHelm.Cloud.Core.Models;

public sealed record Anchorage
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required string Name { get; init; }
    public required Position Position { get; init; }
    public string? HoldingGround { get; init; }
    public double? TypicalDepthMeters { get; init; }
    public string? ShelteredFrom { get; init; }
    public string? Notes { get; init; }
}
