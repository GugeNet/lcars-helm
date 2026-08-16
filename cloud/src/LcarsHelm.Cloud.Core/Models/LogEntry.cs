namespace LcarsHelm.Cloud.Core.Models;

/// <summary>
/// A single telemetry snapshot uploaded by the LCARS helm display, for analytics.
/// Field groups mirror the simulator's VesselState so the shape stays familiar
/// across the boat, the simulator and this store.
/// </summary>
public sealed record LogEntry
{
    public Guid Id { get; init; } = Guid.NewGuid();

    /// <summary>Identifies which boat this reading came from, for future multi-boat use.</summary>
    public required string BoatId { get; init; }

    public required DateTimeOffset Timestamp { get; init; }

    public SituationId? Situation { get; init; }

    public Position? Position { get; init; }

    public double? HeadingTrue { get; init; }
    public double? CourseOverGround { get; init; }
    public double? SpeedOverGround { get; init; }
    public double? SpeedThroughWater { get; init; }
    public double? RateOfTurn { get; init; }

    public WindReading? Wind { get; init; }

    public double? DepthBelowSurface { get; init; }
    public double? WaterTemperature { get; init; }
    public double? AirTemperature { get; init; }
    public double? Pressure { get; init; }
    public double? Humidity { get; init; }

    public EngineReading? Engine { get; init; }
    public ElectricalReading? Electrical { get; init; }
    public AnchorReading? Anchor { get; init; }
    public NavigationReading? Navigation { get; init; }
}

public sealed record WindReading
{
    public double? DirectionTrue { get; init; }
    public double? SpeedTrue { get; init; }
    public double? AngleTrue { get; init; }
    public double? AngleApparent { get; init; }
    public double? SpeedApparent { get; init; }
}

public sealed record EngineReading
{
    public bool Running { get; init; }
    public double? Rpm { get; init; }
    public double? CoolantTemperature { get; init; }
    public double? OilPressure { get; init; }
    public double? AlternatorVoltage { get; init; }
    public double? FuelRate { get; init; }
    public double? TotalHours { get; init; }
}

public sealed record ElectricalReading
{
    public double? BatteryVoltage { get; init; }
    public double? BatteryCurrent { get; init; }
    public double? StateOfCharge { get; init; }
    public double? SolarPower { get; init; }
    public double? ShorePower { get; init; }
    public bool ShoreConnected { get; init; }
}

public sealed record AnchorReading
{
    public bool Deployed { get; init; }
    public Position? Position { get; init; }
    public double? RodeLength { get; init; }
    public double? AlarmRadius { get; init; }
    public double? DistanceFromDrop { get; init; }
}

public sealed record NavigationReading
{
    public string? WaypointName { get; init; }
    public double? DistanceToWaypoint { get; init; }
    public double? BearingToWaypoint { get; init; }
    public double? Vmg { get; init; }
    public double? TimeToGo { get; init; }
    public double? CrossTrackError { get; init; }
}
