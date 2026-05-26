using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Data.Configurations;

public class AgentCapabilityConfiguration : IEntityTypeConfiguration<AgentCapability>
{
    public void Configure(EntityTypeBuilder<AgentCapability> builder)
    {
        builder.HasKey(ac => ac.Id);
        builder.Property(ac => ac.Name).IsRequired().HasMaxLength(255);
        builder.Property(ac => ac.Description).HasMaxLength(1000);
        builder.Property(ac => ac.InputSchema).HasColumnType("jsonb");
        builder.Property(ac => ac.OutputSchema).HasColumnType("jsonb");

        builder.HasOne(ac => ac.Agent).WithMany(a => a.Capabilities).HasForeignKey(ac => ac.AgentId);
    }
}
