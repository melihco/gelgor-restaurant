using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Data.Configurations;

public class AgentConfiguration : IEntityTypeConfiguration<Agent>
{
    public void Configure(EntityTypeBuilder<Agent> builder)
    {
        builder.HasKey(a => a.Id);
        builder.Property(a => a.Name).IsRequired().HasMaxLength(255);
        builder.Property(a => a.DisplayName).IsRequired().HasMaxLength(255);
        builder.Property(a => a.AvatarUrl).HasMaxLength(500);
        builder.Property(a => a.Description).HasMaxLength(1000);
        builder.Property(a => a.AgentType).IsRequired();
        builder.Property(a => a.State).IsRequired();
        builder.Property(a => a.Configuration).HasColumnType("jsonb");
        builder.Property(a => a.SystemPrompt).HasColumnType("text");

        builder.HasOne(a => a.Office).WithMany(o => o.Agents).HasForeignKey(a => a.OfficeId);
        builder.HasOne(a => a.Zone).WithMany(oz => oz.Agents).HasForeignKey(a => a.ZoneId).IsRequired(false);
        builder.HasOne(a => a.CurrentTask).WithMany().HasForeignKey(a => a.CurrentTaskId).IsRequired(false);
        builder.HasMany(a => a.Capabilities).WithOne(ac => ac.Agent).HasForeignKey(ac => ac.AgentId);
        builder.HasMany(a => a.TaskAssignments).WithOne(ta => ta.Agent).HasForeignKey(ta => ta.AgentId);
        builder.HasMany(a => a.Runs).WithOne(ar => ar.Agent).HasForeignKey(ar => ar.AgentId);
        builder.HasMany(a => a.MemoryReferences).WithOne(amr => amr.Agent).HasForeignKey(amr => amr.AgentId);
    }
}
