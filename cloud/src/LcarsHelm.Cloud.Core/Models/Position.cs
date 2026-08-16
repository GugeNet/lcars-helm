namespace LcarsHelm.Cloud.Core.Models;

/// <summary>A WGS84 position in degrees, matching the simulator's LatLon.</summary>
public readonly record struct Position(double Latitude, double Longitude);
