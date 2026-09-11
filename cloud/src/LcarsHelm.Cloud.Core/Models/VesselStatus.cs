namespace LcarsHelm.Cloud.Core.Models;

/// <summary>
/// A vessel's approval state. New registrations start <see cref="Pending"/> and are
/// only allowed to upload logs once a person approves them in the dashboard — the
/// key pair alone proves "the same installation that registered", not "a boat we
/// actually operate".
/// </summary>
public enum VesselStatus
{
    Pending,
    Approved,
    Revoked,
}
