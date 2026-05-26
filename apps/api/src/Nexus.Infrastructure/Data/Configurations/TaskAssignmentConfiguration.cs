using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Data.Configurations;

public class TaskAssignmentConfiguration : IEntityTypeConfiguration<TaskAssignment>
{
    public void Configure(EntityTypeBuilder<TaskAssignment> builder)
    {
        builder.HasKey(ta => ta.Id);
        builder.HasIndex(ta => new { ta.TaskId, ta.AgentId }).IsUnique();

        builder.HasOne(ta => ta.Task).WithMany(t => t.Assignments).HasForeignKey(ta => ta.TaskId);
        builder.HasOne(ta => ta.Agent).WithMany(a => a.TaskAssignments).HasForeignKey(ta => ta.AgentId);
    }
}
