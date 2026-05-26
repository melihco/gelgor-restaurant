using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Data.Configurations;

public class TaskItemConfiguration : IEntityTypeConfiguration<TaskItem>
{
    public void Configure(EntityTypeBuilder<TaskItem> builder)
    {
        builder.HasKey(t => t.Id);
        builder.Property(t => t.Title).IsRequired().HasMaxLength(500);
        builder.Property(t => t.Description).HasMaxLength(2000);
        builder.Property(t => t.Status).IsRequired();
        builder.Property(t => t.Priority).IsRequired();
        builder.Property(t => t.Input).HasColumnType("jsonb");
        builder.Property(t => t.Output).HasColumnType("jsonb");
        builder.Property(t => t.ErrorMessage).HasMaxLength(2000);
        builder.HasIndex(t => new { t.BriefId, t.Status });

        builder.HasOne(t => t.Brief).WithMany(b => b.Tasks).HasForeignKey(t => t.BriefId);
        builder.HasOne(t => t.ParentTask).WithMany(t => t.SubTasks).HasForeignKey(t => t.ParentTaskId).IsRequired(false);
        builder.HasMany(t => t.Dependencies).WithOne(td => td.Task).HasForeignKey(td => td.TaskId);
        builder.HasMany(t => t.DependentTasks).WithOne(td => td.DependsOnTask).HasForeignKey(td => td.DependsOnTaskId);
        builder.HasMany(t => t.Assignments).WithOne(ta => ta.Task).HasForeignKey(ta => ta.TaskId);
        builder.HasMany(t => t.Artifacts).WithOne(oa => oa.Task).HasForeignKey(oa => oa.TaskId);
        builder.HasMany(t => t.Reviews).WithOne(rd => rd.Task).HasForeignKey(rd => rd.TaskId);
        builder.HasMany(t => t.AgentRuns).WithOne(ar => ar.Task).HasForeignKey(ar => ar.TaskId);
    }
}
