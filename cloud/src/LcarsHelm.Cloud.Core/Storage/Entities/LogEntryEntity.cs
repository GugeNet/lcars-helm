using Azure;
using Azure.Data.Tables;
using LcarsHelm.Cloud.Core.Models;

namespace LcarsHelm.Cloud.Core.Storage.Entities;

/// <summary>
/// Flat Table Storage projection of <see cref="LogEntry"/>. Every reading is its own
/// column (rather than a serialized blob) so it stays queryable/filterable in Table
/// Storage and in tools like Azure Data Explorer.
/// </summary>
public sealed class LogEntryEntity : ITableEntity
{
    public string PartitionKey { get; set; } = string.Empty;
    public string RowKey { get; set; } = string.Empty;
    public DateTimeOffset? Timestamp { get; set; }
    public ETag ETag { get; set; }

    public Guid Id { get; set; }
    public string BoatId { get; set; } = string.Empty;
    public DateTimeOffset EntryTimestamp { get; set; }
    public string? Situation { get; set; }

    public double? Latitude { get; set; }
    public double? Longitude { get; set; }

    public double? HeadingTrue { get; set; }
    public double? CourseOverGround { get; set; }
    public double? SpeedOverGround { get; set; }
    public double? SpeedThroughWater { get; set; }
    public double? RateOfTurn { get; set; }

    public double? WindDirectionTrue { get; set; }
    public double? WindSpeedTrue { get; set; }
    public double? WindAngleTrue { get; set; }
    public double? WindAngleApparent { get; set; }
    public double? WindSpeedApparent { get; set; }

    public double? DepthBelowSurface { get; set; }
    public double? WaterTemperature { get; set; }
    public double? AirTemperature { get; set; }
    public double? Pressure { get; set; }
    public double? Humidity { get; set; }

    public bool? EngineRunning { get; set; }
    public double? EngineRpm { get; set; }
    public double? EngineCoolantTemperature { get; set; }
    public double? EngineOilPressure { get; set; }
    public double? EngineAlternatorVoltage { get; set; }
    public double? EngineFuelRate { get; set; }
    public double? EngineTotalHours { get; set; }

    public double? BatteryVoltage { get; set; }
    public double? BatteryCurrent { get; set; }
    public double? BatteryStateOfCharge { get; set; }
    public double? SolarPower { get; set; }
    public double? ShorePower { get; set; }
    public bool? ShoreConnected { get; set; }

    public bool? AnchorDeployed { get; set; }
    public double? AnchorLatitude { get; set; }
    public double? AnchorLongitude { get; set; }
    public double? AnchorRodeLength { get; set; }
    public double? AnchorAlarmRadius { get; set; }
    public double? AnchorDistanceFromDrop { get; set; }

    public string? WaypointName { get; set; }
    public double? DistanceToWaypoint { get; set; }
    public double? BearingToWaypoint { get; set; }
    public double? Vmg { get; set; }
    public double? TimeToGo { get; set; }
    public double? CrossTrackError { get; set; }

    public static string BuildPartitionKey(string boatId, DateTimeOffset timestamp) =>
        $"{boatId}_{timestamp.UtcDateTime:yyyy-MM-dd}";

    /// <summary>Reverse-chronological RowKey so newest entries page first.</summary>
    public static string BuildRowKey(DateTimeOffset timestamp, Guid id) =>
        $"{DateTimeOffset.MaxValue.Ticks - timestamp.UtcTicks:D19}_{id:N}";

    public static LogEntryEntity FromModel(LogEntry entry)
    {
        return new LogEntryEntity
        {
            PartitionKey = BuildPartitionKey(entry.BoatId, entry.Timestamp),
            RowKey = BuildRowKey(entry.Timestamp, entry.Id),
            Id = entry.Id,
            BoatId = entry.BoatId,
            EntryTimestamp = entry.Timestamp,
            Situation = entry.Situation?.ToString(),
            Latitude = entry.Position?.Latitude,
            Longitude = entry.Position?.Longitude,
            HeadingTrue = entry.HeadingTrue,
            CourseOverGround = entry.CourseOverGround,
            SpeedOverGround = entry.SpeedOverGround,
            SpeedThroughWater = entry.SpeedThroughWater,
            RateOfTurn = entry.RateOfTurn,
            WindDirectionTrue = entry.Wind?.DirectionTrue,
            WindSpeedTrue = entry.Wind?.SpeedTrue,
            WindAngleTrue = entry.Wind?.AngleTrue,
            WindAngleApparent = entry.Wind?.AngleApparent,
            WindSpeedApparent = entry.Wind?.SpeedApparent,
            DepthBelowSurface = entry.DepthBelowSurface,
            WaterTemperature = entry.WaterTemperature,
            AirTemperature = entry.AirTemperature,
            Pressure = entry.Pressure,
            Humidity = entry.Humidity,
            EngineRunning = entry.Engine?.Running,
            EngineRpm = entry.Engine?.Rpm,
            EngineCoolantTemperature = entry.Engine?.CoolantTemperature,
            EngineOilPressure = entry.Engine?.OilPressure,
            EngineAlternatorVoltage = entry.Engine?.AlternatorVoltage,
            EngineFuelRate = entry.Engine?.FuelRate,
            EngineTotalHours = entry.Engine?.TotalHours,
            BatteryVoltage = entry.Electrical?.BatteryVoltage,
            BatteryCurrent = entry.Electrical?.BatteryCurrent,
            BatteryStateOfCharge = entry.Electrical?.StateOfCharge,
            SolarPower = entry.Electrical?.SolarPower,
            ShorePower = entry.Electrical?.ShorePower,
            ShoreConnected = entry.Electrical?.ShoreConnected,
            AnchorDeployed = entry.Anchor?.Deployed,
            AnchorLatitude = entry.Anchor?.Position?.Latitude,
            AnchorLongitude = entry.Anchor?.Position?.Longitude,
            AnchorRodeLength = entry.Anchor?.RodeLength,
            AnchorAlarmRadius = entry.Anchor?.AlarmRadius,
            AnchorDistanceFromDrop = entry.Anchor?.DistanceFromDrop,
            WaypointName = entry.Navigation?.WaypointName,
            DistanceToWaypoint = entry.Navigation?.DistanceToWaypoint,
            BearingToWaypoint = entry.Navigation?.BearingToWaypoint,
            Vmg = entry.Navigation?.Vmg,
            TimeToGo = entry.Navigation?.TimeToGo,
            CrossTrackError = entry.Navigation?.CrossTrackError,
        };
    }

    public LogEntry ToModel()
    {
        return new LogEntry
        {
            Id = Id,
            BoatId = BoatId,
            Timestamp = EntryTimestamp,
            Situation = Situation is not null ? Enum.Parse<SituationId>(Situation) : null,
            Position = Latitude.HasValue && Longitude.HasValue
                ? new Position(Latitude.Value, Longitude.Value)
                : null,
            HeadingTrue = HeadingTrue,
            CourseOverGround = CourseOverGround,
            SpeedOverGround = SpeedOverGround,
            SpeedThroughWater = SpeedThroughWater,
            RateOfTurn = RateOfTurn,
            Wind = new WindReading
            {
                DirectionTrue = WindDirectionTrue,
                SpeedTrue = WindSpeedTrue,
                AngleTrue = WindAngleTrue,
                AngleApparent = WindAngleApparent,
                SpeedApparent = WindSpeedApparent,
            },
            DepthBelowSurface = DepthBelowSurface,
            WaterTemperature = WaterTemperature,
            AirTemperature = AirTemperature,
            Pressure = Pressure,
            Humidity = Humidity,
            Engine = new EngineReading
            {
                Running = EngineRunning ?? false,
                Rpm = EngineRpm,
                CoolantTemperature = EngineCoolantTemperature,
                OilPressure = EngineOilPressure,
                AlternatorVoltage = EngineAlternatorVoltage,
                FuelRate = EngineFuelRate,
                TotalHours = EngineTotalHours,
            },
            Electrical = new ElectricalReading
            {
                BatteryVoltage = BatteryVoltage,
                BatteryCurrent = BatteryCurrent,
                StateOfCharge = BatteryStateOfCharge,
                SolarPower = SolarPower,
                ShorePower = ShorePower,
                ShoreConnected = ShoreConnected ?? false,
            },
            Anchor = new AnchorReading
            {
                Deployed = AnchorDeployed ?? false,
                Position = AnchorLatitude.HasValue && AnchorLongitude.HasValue
                    ? new Position(AnchorLatitude.Value, AnchorLongitude.Value)
                    : null,
                RodeLength = AnchorRodeLength,
                AlarmRadius = AnchorAlarmRadius,
                DistanceFromDrop = AnchorDistanceFromDrop,
            },
            Navigation = new NavigationReading
            {
                WaypointName = WaypointName,
                DistanceToWaypoint = DistanceToWaypoint,
                BearingToWaypoint = BearingToWaypoint,
                Vmg = Vmg,
                TimeToGo = TimeToGo,
                CrossTrackError = CrossTrackError,
            },
        };
    }
}
