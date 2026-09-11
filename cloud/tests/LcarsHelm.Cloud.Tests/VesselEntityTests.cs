using LcarsHelm.Cloud.Core.Models;
using LcarsHelm.Cloud.Core.Storage.Entities;

namespace LcarsHelm.Cloud.Tests;

public class VesselEntityTests
{
    private static Vessel SampleVessel() => new()
    {
        Name = "Cinderella",
        PublicKeyPem = "-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----",
        PublicKeyFingerprint = "deadbeef",
        Status = VesselStatus.Approved,
        RegisteredAt = new DateTimeOffset(2026, 9, 1, 8, 0, 0, TimeSpan.Zero),
        ApprovedAt = new DateTimeOffset(2026, 9, 1, 9, 0, 0, TimeSpan.Zero),
        LastSeenAt = new DateTimeOffset(2026, 9, 11, 10, 0, 0, TimeSpan.Zero),
        LastUploadAt = new DateTimeOffset(2026, 9, 11, 9, 0, 0, TimeSpan.Zero),
    };

    [Fact]
    public void RoundTrip_PreservesAllFields()
    {
        var original = SampleVessel();

        var entity = VesselEntity.FromModel(original);
        var roundTripped = entity.ToModel();

        Assert.Equal(original.Id, roundTripped.Id);
        Assert.Equal(original.Name, roundTripped.Name);
        Assert.Equal(original.PublicKeyPem, roundTripped.PublicKeyPem);
        Assert.Equal(original.PublicKeyFingerprint, roundTripped.PublicKeyFingerprint);
        Assert.Equal(original.Status, roundTripped.Status);
        Assert.Equal(original.RegisteredAt, roundTripped.RegisteredAt);
        Assert.Equal(original.ApprovedAt, roundTripped.ApprovedAt);
        Assert.Equal(original.LastSeenAt, roundTripped.LastSeenAt);
        Assert.Equal(original.LastUploadAt, roundTripped.LastUploadAt);
    }

    [Fact]
    public void AllVessels_SharePartition()
    {
        var entity = VesselEntity.FromModel(SampleVessel());

        Assert.Equal(VesselEntity.PartitionKeyValue, entity.PartitionKey);
    }

    [Fact]
    public void NewVessel_DefaultsToPending()
    {
        var vessel = new Vessel
        {
            Name = "Bench",
            PublicKeyPem = "pem",
            PublicKeyFingerprint = "fp",
            RegisteredAt = DateTimeOffset.UtcNow,
        };

        Assert.Equal(VesselStatus.Pending, vessel.Status);
    }
}
