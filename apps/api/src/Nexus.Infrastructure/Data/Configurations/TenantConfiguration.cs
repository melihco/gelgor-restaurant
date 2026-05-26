using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Data.Configurations;

public class TenantConfiguration : IEntityTypeConfiguration<Tenant>
{
    public void Configure(EntityTypeBuilder<Tenant> builder)
    {
        builder.HasKey(t => t.Id);
        builder.Property(t => t.Name).IsRequired().HasMaxLength(255);
        builder.Property(t => t.Slug).IsRequired().HasMaxLength(255);
        builder.HasIndex(t => t.Slug).IsUnique();
        builder.Property(t => t.LogoUrl).HasMaxLength(500);
        builder.Property(t => t.Plan).HasMaxLength(50);
        builder.Property(t => t.Settings).HasColumnType("jsonb");

        builder.HasMany(t => t.Users).WithOne(u => u.Tenant).HasForeignKey(u => u.TenantId);
        builder.HasMany(t => t.Offices).WithOne(o => o.Tenant).HasForeignKey(o => o.TenantId);
        builder.HasMany(t => t.Agents).WithOne().HasForeignKey(a => a.TenantId);
        builder.HasMany(t => t.Briefs).WithOne().HasForeignKey(b => b.TenantId);
        builder.HasMany(t => t.Tasks).WithOne().HasForeignKey(t => t.TenantId);
        builder.HasMany(t => t.Artifacts).WithOne().HasForeignKey(a => a.TenantId);
        builder.HasMany(t => t.AgentRuns).WithOne().HasForeignKey(ar => ar.TenantId);
        builder.HasMany(t => t.Notifications).WithOne().HasForeignKey(n => n.TenantId);
        builder.HasMany(t => t.AuditLogs).WithOne().HasForeignKey(al => al.TenantId);
        builder.HasMany(t => t.BrandMemories).WithOne(bm => bm.Tenant).HasForeignKey(bm => bm.TenantId);
        builder.HasMany(t => t.AgentMemories).WithOne(am => am.Tenant).HasForeignKey(am => am.TenantId);
    }
}
