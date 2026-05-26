using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Data.Configurations;

public class SuggestedActionConfiguration : IEntityTypeConfiguration<SuggestedAction>
{
    public void Configure(EntityTypeBuilder<SuggestedAction> builder)
    {
        builder.ToTable("SuggestedActions");
        builder.HasKey(e => e.Id);

        builder.Property(e => e.ActionType).HasMaxLength(100).IsRequired();
        builder.Property(e => e.TargetRef).HasMaxLength(500);
        builder.Property(e => e.Payload).HasColumnType("jsonb");

        builder.HasOne(e => e.Artifact)
            .WithMany()
            .HasForeignKey(e => e.ArtifactId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(e => e.IntegrationConnection)
            .WithMany()
            .HasForeignKey(e => e.IntegrationConnectionId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasMany(e => e.ExecutionJobs)
            .WithOne(j => j.SuggestedAction)
            .HasForeignKey(j => j.SuggestedActionId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(e => new { e.TenantId, e.Status });
    }
}
