using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Data.Configurations;

public class AgentMemoryReferenceConfiguration : IEntityTypeConfiguration<AgentMemoryReference>
{
    public void Configure(EntityTypeBuilder<AgentMemoryReference> builder)
    {
        builder.HasKey(amr => amr.Id);
        builder.Property(amr => amr.MemoryType).IsRequired().HasMaxLength(100);
        builder.Property(amr => amr.Key).IsRequired().HasMaxLength(255);
        builder.Property(amr => amr.Value).HasColumnType("jsonb");
        builder.HasIndex(amr => new { amr.TenantId, amr.AgentId, amr.MemoryType });

        builder.HasOne(amr => amr.Agent).WithMany(a => a.MemoryReferences).HasForeignKey(amr => amr.AgentId);
        builder.HasOne(amr => amr.Tenant).WithMany(t => t.AgentMemories).HasForeignKey(amr => amr.TenantId);
    }
}
