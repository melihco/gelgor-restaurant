using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Data.Configurations;

public class TaskDependencyConfiguration : IEntityTypeConfiguration<TaskDependency>
{
    public void Configure(EntityTypeBuilder<TaskDependency> builder)
    {
        builder.HasKey(td => td.Id);
        builder.HasIndex(td => new { td.TaskId, td.DependsOnTaskId }).IsUnique();

        builder.HasOne(td => td.Task).WithMany(t => t.Dependencies).HasForeignKey(td => td.TaskId);
        builder.HasOne(td => td.DependsOnTask).WithMany(t => t.DependentTasks).HasForeignKey(td => td.DependsOnTaskId);
    }
}
