using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nexus.Domain.Entities;

namespace Nexus.Infrastructure.Data.Configurations;

public class OfficeConfiguration : IEntityTypeConfiguration<Office>
{
    public void Configure(EntityTypeBuilder<Office> builder)
    {
        builder.HasKey(o => o.Id);
        builder.Property(o => o.Name).IsRequired().HasMaxLength(255);
        builder.Property(o => o.Description).HasMaxLength(1000);
        builder.Property(o => o.Configuration).HasColumnType("jsonb");
        builder.HasIndex(o => new { o.TenantId, o.IsDefault });

        builder.HasOne(o => o.Tenant).WithMany(t => t.Offices).HasForeignKey(o => o.TenantId);
        builder.HasMany(o => o.Zones).WithOne(oz => oz.Office).HasForeignKey(oz => oz.OfficeId);
        builder.HasMany(o => o.Agents).WithOne(a => a.Office).HasForeignKey(a => a.OfficeId);
    }
}
