using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Data.Configurations;

public class ReviewDecisionConfiguration : IEntityTypeConfiguration<ReviewDecision>
{
    public void Configure(EntityTypeBuilder<ReviewDecision> builder)
    {
        builder.HasKey(rd => rd.Id);
        builder.Property(rd => rd.Comment).HasMaxLength(2000);
        builder.Property(rd => rd.Status).IsRequired();

        builder.HasOne(rd => rd.Artifact).WithMany(oa => oa.Reviews).HasForeignKey(rd => rd.ArtifactId);
        builder.HasOne(rd => rd.Task).WithMany(t => t.Reviews).HasForeignKey(rd => rd.TaskId);
        builder.HasOne(rd => rd.ReviewedByUser).WithMany(u => u.ReviewDecisions).HasForeignKey(rd => rd.ReviewedByUserId);
    }
}
