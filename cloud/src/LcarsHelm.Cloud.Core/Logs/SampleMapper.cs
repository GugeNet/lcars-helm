using System.Text.Json;
using LcarsHelm.Cloud.Core.Models;

namespace LcarsHelm.Cloud.Core.Logs;

/// <summary>
/// Maps one log sample's Signal K paths onto <see cref="LogEntry"/> fields. The path
/// strings below must be kept in sync with the plugin's list — currently exactly
/// <c>PATHS</c> in webapp/src/signalk/paths.ts — since that is what a sample actually
/// carries under those keys.
/// </summary>
public static class SampleMapper
{
    public static LogEntry ToLogEntry(string boatId, LogSample sample)
    {
        var paths = sample.Paths;

        // No path in PATHS carries a running/not-running boolean for the engine; the
        // display never needed one. Any measurable revolutions is close enough for a
        // once-a-minute row — full-resolution analytics reads the blob archive.
        var revolutions = ReadDouble(paths, "propulsion.port.revolutions");

        return new LogEntry
        {
            BoatId = boatId,
            Timestamp = sample.Timestamp,
            Situation = ParseSituation(sample.Situation),
            Position = ReadPosition(paths, "navigation.position"),
            HeadingTrue = ReadDouble(paths, "navigation.headingTrue"),
            CourseOverGround = ReadDouble(paths, "navigation.courseOverGroundTrue"),
            SpeedOverGround = ReadDouble(paths, "navigation.speedOverGround"),
            SpeedThroughWater = ReadDouble(paths, "navigation.speedThroughWater"),
            RateOfTurn = ReadDouble(paths, "navigation.rateOfTurn"),
            Wind = new WindReading
            {
                DirectionTrue = ReadDouble(paths, "environment.wind.directionTrue"),
                SpeedTrue = ReadDouble(paths, "environment.wind.speedTrue"),
                AngleTrue = ReadDouble(paths, "environment.wind.angleTrueWater"),
                AngleApparent = ReadDouble(paths, "environment.wind.angleApparent"),
                SpeedApparent = ReadDouble(paths, "environment.wind.speedApparent"),
            },
            DepthBelowSurface = ReadDouble(paths, "environment.depth.belowSurface"),
            WaterTemperature = ReadDouble(paths, "environment.water.temperature"),
            AirTemperature = ReadDouble(paths, "environment.outside.temperature"),
            Pressure = ReadDouble(paths, "environment.outside.pressure"),
            Humidity = ReadDouble(paths, "environment.outside.humidity"),
            Engine = new EngineReading
            {
                Running = revolutions is > 0,
                Rpm = revolutions,
                CoolantTemperature = ReadDouble(paths, "propulsion.port.temperature"),
                OilPressure = ReadDouble(paths, "propulsion.port.oilPressure"),
                AlternatorVoltage = ReadDouble(paths, "propulsion.port.alternatorVoltage"),
                FuelRate = ReadDouble(paths, "propulsion.port.fuel.rate"),
                TotalHours = ReadDouble(paths, "propulsion.port.runTime"),
            },
            Electrical = new ElectricalReading
            {
                BatteryVoltage = ReadDouble(paths, "electrical.batteries.house.voltage"),
                BatteryCurrent = ReadDouble(paths, "electrical.batteries.house.current"),
                StateOfCharge = ReadDouble(paths, "electrical.batteries.house.capacity.stateOfCharge"),
                SolarPower = ReadDouble(paths, "electrical.solar.main.panelPower"),
                ShorePower = ReadDouble(paths, "electrical.inverters.main.acin.power"),
                // The Multiplus's own mains LED, not a wattage threshold — see the
                // comment on `shoreConnected` in paths.ts for why that distinction
                // matters (float charge reads near-zero watts while still connected).
                ShoreConnected = ReadDouble(paths, "electrical.chargers.main.leds.mains") is > 0,
            },
            Anchor = new AnchorReading
            {
                Deployed = paths.ContainsKey("navigation.anchor.position"),
                Position = ReadPosition(paths, "navigation.anchor.position"),
                RodeLength = ReadDouble(paths, "navigation.anchor.rodeLength"),
                AlarmRadius = ReadDouble(paths, "navigation.anchor.maxRadius"),
                DistanceFromDrop = ReadDouble(paths, "navigation.anchor.currentRadius"),
            },
            Navigation = new NavigationReading
            {
                DistanceToWaypoint = ReadDouble(paths, "navigation.courseGreatCircle.nextPoint.distance"),
                BearingToWaypoint = ReadDouble(paths, "navigation.courseGreatCircle.nextPoint.bearingTrue"),
                Vmg = ReadDouble(paths, "navigation.courseGreatCircle.nextPoint.velocityMadeGood"),
                TimeToGo = ReadDouble(paths, "navigation.courseGreatCircle.nextPoint.timeToGo"),
                CrossTrackError = ReadDouble(paths, "navigation.courseGreatCircle.crossTrackError"),
            },
        };
    }

    private static double? ReadDouble(IReadOnlyDictionary<string, JsonElement> paths, string path)
    {
        if (!paths.TryGetValue(path, out var element)) return null;
        return element.ValueKind == JsonValueKind.Number ? element.GetDouble() : null;
    }

    private static Position? ReadPosition(IReadOnlyDictionary<string, JsonElement> paths, string path)
    {
        if (!paths.TryGetValue(path, out var element) || element.ValueKind != JsonValueKind.Object) return null;
        if (!element.TryGetProperty("latitude", out var latitude) || !element.TryGetProperty("longitude", out var longitude))
        {
            return null;
        }
        return new Position(latitude.GetDouble(), longitude.GetDouble());
    }

    private static SituationId? ParseSituation(string? situation) =>
        situation is not null && Enum.TryParse<SituationId>(situation, ignoreCase: true, out var result)
            ? result
            : null;
}
