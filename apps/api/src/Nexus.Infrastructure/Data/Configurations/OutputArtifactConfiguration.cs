using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Data.Configurations;

public class OutputArtifactConfiguration : IEntityTypeConfiguration<OutputArtifact>
{
    public void Configure(EntityTypeBuilder<OutputArtifact> builder)
    {
        builder.HasKey(oa => oa.Id);
        builder.Property(oa => oa.Title).IsRequired().HasMaxLength(500);
        builder.Property(oa => oa.Content).HasColumnType("text");
        builder.Property(oa => oa.ContentUrl).HasMaxLength(1000);
        builder.Property(oa => oa.Metadata).HasColumnType("jsonb");
        builder.Property(oa => oa.ArtifactType).IsRequired();
        builder.HasIndex(oa => new { oa.TenantId, oa.TaskId, oa.IsLatest });

        builder.HasOne(oa => oa.Task).WithMany(t => t.Artifacts).HasForeignKey(oa => oa.TaskId);
        builder.HasOne(oa => oa.AgentRun).WithMany(ar => ar.Artifacts).HasForeignKey(oa => oa.AgentRunId).IsRequired(false);
        builder.HasMany(oa => oa.Reviews).WithOne(rd => rd.Artifact).HasForeignKey(rd => rd.ArtifactId);
    }
}
