using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Data.Configurations;

public class AgentRunConfiguration : IEntityTypeConfiguration<AgentRun>
{
    public void Configure(EntityTypeBuilder<AgentRun> builder)
    {
        builder.HasKey(ar => ar.Id);
        builder.Property(ar => ar.ExecutionLog).HasColumnType("jsonb");
        builder.Property(ar => ar.ErrorMessage).HasMaxLength(2000);
        builder.HasIndex(ar => new { ar.TenantId, ar.AgentId, ar.Status });

        builder.HasOne(ar => ar.Agent).WithMany(a => a.Runs).HasForeignKey(ar => ar.AgentId);
        builder.HasOne(ar => ar.Task).WithMany(t => t.AgentRuns).HasForeignKey(ar => ar.TaskId);
        builder.HasMany(ar => ar.Artifacts).WithOne(oa => oa.AgentRun).HasForeignKey(oa => oa.AgentRunId).IsRequired(false);
    }
}
